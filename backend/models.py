from datetime import datetime
from typing import Literal

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, model_validator, field_validator

Vec3 = tuple[float, float, float]


class Contract(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)


class OrbitRequest(Contract):
    tle: tuple[str, str] | None = None
    omm: dict | None = None
    times: list[AwareDatetime] = Field(min_length=1, max_length=2048)
    source_url: str = Field(min_length=1, max_length=2048)
    data_version: str = Field(min_length=1, max_length=100)
    mode: Literal["computed", "simulated"] = "computed"

    @model_validator(mode="after")
    def one_element_set(self):
        if (self.tle is None) == (self.omm is None):
            raise ValueError("必须提供且只能提供 TLE 或 OMM 中的一种")
        return self


class GeometryRequest(Contract):
    positions_km: list[Vec3] = Field(min_length=1, max_length=32)
    source_direction: Vec3
    coordinate_frame: Literal["ITRS"]
    at: AwareDatetime
    mode: Literal["simulated"] = "simulated"
    boresights: list[Vec3] | None = None
    half_angle_deg: float = Field(default=60.0, gt=0, le=180)
    model_version: Literal["teaching-geometry/1"] = "teaching-geometry/1"

    @field_validator("positions_km")
    @classmethod
    def near_earth_positions(cls, positions):
        if any(abs(x) > 1_000_000 for v in positions for x in v):
            raise ValueError("教学模型仅支持地球附近 100 万千米内的坐标")
        return positions

    @field_validator("source_direction")
    @classmethod
    def nonzero_direction(cls, v):
        if sum(x*x for x in v) <= 1e-20:
            raise ValueError("来射方向不能是零向量")
        return v

    @model_validator(mode="after")
    def consistent_pointing(self):
        if self.boresights is not None:
            if len(self.boresights) != len(self.positions_km):
                raise ValueError("每个模拟卫星都需要对应的模型指向")
            if any(sum(x*x for x in v) <= 1e-20 for v in self.boresights):
                raise ValueError("模型指向不能是零向量")
        return self
