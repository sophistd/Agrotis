from datetime import timezone
from math import acos, degrees

import numpy as np
from astropy import units as u
from astropy.coordinates import CartesianDifferential, CartesianRepresentation, ITRS, TEME
from astropy.time import Time
from astropy.utils import iers
from sgp4 import omm
from sgp4.api import SGP4_ERRORS, Satrec, WGS72
from sgp4.conveniences import sat_epoch_datetime
from sgp4.io import verify_checksum

from .models import GeometryRequest, OrbitRequest

# -- 科学常量与数据政策 -------------------------------------------------
EARTH_AXES_KM = np.array([6378.137, 6378.137, 6356.752314245])
LIGHT_SPEED_KM_S = 299792.458
MAX_PROPAGATION_AGE_HOURS = 72.0
iers.conf.auto_download = False
iers.conf.iers_degraded_accuracy = "error"


class ScienceInputError(ValueError):
    pass


def _satellite(request: OrbitRequest) -> Satrec:
    try:
        if request.tle is not None:
            for i, line in enumerate(request.tle, start=1):
                if len(line) != 69 or not line.startswith(str(i) + " "):
                    raise ScienceInputError("TLE 行号、长度或格式无效")
                verify_checksum(line)
            sat = Satrec.twoline2rv(*request.tle, WGS72)
        else:
            fields = dict(request.omm)
            defaults = {"CENTER_NAME": "EARTH", "REF_FRAME": "TEME", "TIME_SYSTEM": "UTC", "MEAN_ELEMENT_THEORY": "SGP4"}
            for key, expected in defaults.items():
                if fields.get(key, expected) != expected:
                    raise ScienceInputError(f"不支持 OMM {key}={fields[key]}")
                fields.setdefault(key, expected)
            sat = Satrec()
            omm.initialize(sat, fields, WGS72)
        values = [sat.ecco, sat.inclo, sat.nodeo, sat.argpo, sat.mo, sat.no_kozai, sat.bstar, sat.ndot, sat.nddot]
        if not np.all(np.isfinite(values)):
            raise ScienceInputError("轨道元素必须是有限数值")
        if not (0 <= sat.ecco < 1) or not (0 <= sat.inclo <= np.pi) or sat.no_kozai <= 0:
            raise ScienceInputError("轨道元素超出有效范围")
        return sat
    except (KeyError, TypeError, ValueError) as exc:
        raise ScienceInputError(str(exc)) from exc


def propagate_orbit(request: OrbitRequest) -> dict:
    sat = _satellite(request)
    epoch = sat_epoch_datetime(sat)
    result = []
    for at in request.times:
        at = at.astimezone(timezone.utc)
        age_hours = abs((at - epoch).total_seconds()) / 3600
        if age_hours > MAX_PROPAGATION_AGE_HOURS:
            raise ScienceInputError("请求超出轨道历元前后 72 小时的产品有效窗口；需要对应年代的轨道")
        time = Time(at)
        error, position, velocity = sat.sgp4(time.jd1, time.jd2)
        if error:
            raise ScienceInputError(SGP4_ERRORS[error])
        table = iers.IERS_Auto.open()
        _, eop_status = table.ut1_utc(time, return_status=True)
        if int(eop_status) < 0:
            raise ScienceInputError("没有覆盖该时刻的地球定向参数，拒绝声称精确地球固定位置")
        vector = CartesianRepresentation(position*u.km, differentials=CartesianDifferential(velocity*u.km/u.s))
        itrs = TEME(vector, obstime=time).transform_to(ITRS(obstime=time))
        lon, lat, height = itrs.earth_location.to_geodetic("WGS84")
        result.append({
            "at": at.isoformat(),
            "teme_position_km": list(position), "teme_velocity_km_s": list(velocity),
            "itrs_position_km": itrs.cartesian.xyz.to_value(u.km).tolist(),
            "longitude_deg": float(lon.to_value(u.deg)), "latitude_deg": float(lat.to_value(u.deg)),
            "height_km": float(height.to_value(u.km)), "epoch_distance_hours": age_hours,
            "eop_quality": "predicted" if int(eop_status) == iers.FROM_IERS_A_PREDICTION else "measured",
        })
    return {
        "kind": request.mode, "source_url": request.source_url, "data_version": request.data_version,
        "epoch": epoch.isoformat(), "catalog_id": sat.satnum, "states": result,
        "method": "SGP4/WGS72 → TEME → Astropy/ITRS → WGS84",
        "limits": ["轨道推算不等于遥测", "72 小时是产品限制，不是误差保证", "没有姿态或探测器响应信息"],
    }


def _ray_blocked(position: np.ndarray, direction: np.ndarray) -> bool:
    p = position / EARTH_AXES_KM
    d = direction / EARTH_AXES_KM
    aa = float(np.dot(d, d))
    bb = float(2*np.dot(p, d))
    cc = float(np.dot(p, p) - 1)
    disc = bb*bb - 4*aa*cc
    if disc < 0:
        return False
    return bool((-bb + np.sqrt(max(disc, 0)))/(2*aa) >= 0)


def simulate_geometry(request: GeometryRequest) -> dict:
    direction = np.asarray(request.source_direction, dtype=float)
    direction /= np.max(np.abs(direction))
    direction /= np.linalg.norm(direction)
    positions = [np.asarray(p, dtype=float) for p in request.positions_km]
    if any(np.linalg.norm(p/EARTH_AXES_KM) <= 1 for p in positions):
        raise ScienceInputError("卫星位置必须在 WGS84 地球外部")
    # -- 平面波到达时差：方向指向远处源，波沿负方向传播 ---------------------
    reference = positions[0]
    result = []
    for i, p in enumerate(positions):
        blocked = _ray_blocked(p, direction)
        in_fov = None
        if request.boresights is not None:
            bore = np.asarray(request.boresights[i], dtype=float)
            bore /= np.max(np.abs(bore))
            bore /= np.linalg.norm(bore)
            angle = degrees(acos(float(np.clip(np.dot(bore, direction), -1, 1))))
            in_fov = angle <= request.half_angle_deg
        result.append({
            "index": i, "earth_occulted": blocked, "in_model_fov": in_fov,
            "relative_arrival_ms": float(-np.dot(p-reference, direction)/LIGHT_SPEED_KM_S*1000),
            "actual_detection": "unknown",
        })
    return {
        "kind": "simulated", "at": request.at.astimezone(timezone.utc).isoformat(),
        "coordinate_frame": "ITRS", "model_version": request.model_version, "satellites": result,
        "limits": ["远场平面波教学模型", "忽略大气、时钟噪声与响应", "未被遮挡不等于实际探测"],
    }
