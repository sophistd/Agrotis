import json
from datetime import datetime, timedelta
from pathlib import Path

import numpy as np
import pytest
from pydantic import ValidationError
from sgp4.api import Satrec, WGS72
from sgp4.exporter import export_omm

from backend.models import GeometryRequest, OrbitRequest
from backend.science import ScienceInputError, propagate_orbit, simulate_geometry

REFERENCE = json.loads((Path(__file__).resolve().parents[2]/"data/reference-orbit.json").read_text())


def orbit_request(minutes=0, **extra):
    at = datetime.fromisoformat(REFERENCE["epoch"]) + timedelta(minutes=minutes)
    return OrbitRequest(tle=REFERENCE["tle"], times=[at], source_url=REFERENCE["source_url"], data_version="vallado-reference/1", **extra)


@pytest.mark.parametrize("index", [0, 1, 2, 3, 4])
def test_vallado_reference_vectors(index):
    expected = REFERENCE["samples"][index]
    actual = propagate_orbit(orbit_request(expected["minutes"]))["states"][0]
    np.testing.assert_allclose(actual["teme_position_km"], expected["position_km"], atol=1e-6, rtol=0)
    np.testing.assert_allclose(actual["teme_velocity_km_s"], expected["velocity_km_s"], atol=1e-8, rtol=0)
    assert -180 <= actual["longitude_deg"] <= 180
    assert -90 <= actual["latitude_deg"] <= 90
    assert actual["height_km"] > 0


def test_stale_epoch_is_rejected():
    with pytest.raises(ScienceInputError, match="72 小时"):
        propagate_orbit(orbit_request(60*24*365))


def test_naive_time_is_rejected():
    with pytest.raises(ValidationError):
        OrbitRequest(tle=REFERENCE["tle"], times=["2000-06-27T18:50:19"], source_url="test", data_version="1")


def test_checksum_is_checked():
    r = orbit_request()
    r.tle = (r.tle[0][:-1]+"4", r.tle[1])
    with pytest.raises(ScienceInputError):
        propagate_orbit(r)


def test_ambiguous_elements_are_rejected():
    with pytest.raises(ValidationError):
        OrbitRequest(tle=REFERENCE["tle"], omm={}, times=[REFERENCE["epoch"]], source_url="test", data_version="1")


def geometry(direction, positions=None, **extra):
    return GeometryRequest(positions_km=positions or [[7000,0,0],[-7000,0,0]], source_direction=direction, coordinate_frame="ITRS", at="2023-03-07T15:44:06.670Z", **extra)


def test_front_back_earth_occultation():
    result = simulate_geometry(geometry([1,0,0]))
    assert [s["earth_occulted"] for s in result["satellites"]] == [False,True]
    assert result["satellites"][1]["relative_arrival_ms"] == pytest.approx(14000/299792.458*1000)
    assert all(x["actual_detection"] == "unknown" for x in result["satellites"])


def test_perpendicular_direction_has_equal_arrival():
    result = simulate_geometry(geometry([0,1,0]))
    assert all(not x["earth_occulted"] for x in result["satellites"])
    assert result["satellites"][1]["relative_arrival_ms"] == pytest.approx(0)


def test_pointing_missing_stays_unknown():
    assert simulate_geometry(geometry([1,0,0]))["satellites"][0]["in_model_fov"] is None


def test_explicit_model_pointing():
    result = simulate_geometry(geometry([1,0,0], boresights=[[1,0,0],[-1,0,0]], half_angle_deg=30))
    assert [x["in_model_fov"] for x in result["satellites"]] == [True,False]


def test_underground_satellite_is_rejected():
    with pytest.raises(ScienceInputError):
        simulate_geometry(geometry([1,0,0], positions=[[100,0,0]]))


@pytest.mark.parametrize("direction", [[0,0,0],[float("nan"),0,0],[float("inf"),0,0]])
def test_invalid_directions_are_rejected(direction):
    with pytest.raises(ValidationError):
        geometry(direction)


def test_direction_scaling_does_not_change_result():
    assert simulate_geometry(geometry([1,0,0])) == simulate_geometry(geometry([100,0,0]))


def test_omm_and_tle_agree_on_same_reference_orbit():
    tle = orbit_request()
    fields = export_omm(Satrec.twoline2rv(*tle.tle, WGS72), "VANGUARD REFERENCE")
    omm = OrbitRequest(omm=fields, times=tle.times, source_url=tle.source_url, data_version=tle.data_version)
    a = propagate_orbit(tle)["states"][0]
    b = propagate_orbit(omm)["states"][0]
    np.testing.assert_allclose(a["teme_position_km"], b["teme_position_km"], atol=1e-6, rtol=0)


def test_nan_mean_motion_is_rejected():
    tle = orbit_request()
    fields = export_omm(Satrec.twoline2rv(*tle.tle, WGS72), "REFERENCE")
    fields["MEAN_MOTION"] = float("nan")
    with pytest.raises(ScienceInputError):
        propagate_orbit(OrbitRequest(omm=fields, times=tle.times, source_url="reference", data_version="1"))


def test_large_finite_direction_is_normalized_without_overflow():
    assert simulate_geometry(geometry([1e308,0,0])) == simulate_geometry(geometry([1,0,0]))


def test_out_of_model_position_is_rejected():
    with pytest.raises(ValidationError):
        geometry([1,0,0], positions=[[1e308,0,0]])
