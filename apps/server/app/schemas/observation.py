from typing import Literal
from urllib.parse import urlsplit

from pydantic import BaseModel, ConfigDict, Field, field_validator


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True, strict=True)


class Page(StrictModel):
    origin: str = Field(max_length=255)
    title: str = Field(max_length=512)

    @field_validator("origin")
    @classmethod
    def origin_only(cls, value: str) -> str:
        parsed = urlsplit(value)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc or parsed.path or parsed.query or parsed.fragment or parsed.username:
            raise ValueError("origin must contain only scheme, host, and optional port")
        return value


class BBox(StrictModel):
    x: float
    y: float
    width: float = Field(ge=0)
    height: float = Field(ge=0)


class ElementSnapshot(StrictModel):
    id: str = Field(pattern=r"^[EV]\d{3,4}$")
    role: str = Field(min_length=1, max_length=64)
    label: str | None = Field(default=None, max_length=512)
    value: str | None = Field(default=None, max_length=512)
    bbox: BBox | None = None
    enabled: bool
    visible: bool
    source: Literal["DOM", "VISUAL", "MERGED"]


class RedactionSummary(StrictModel):
    count: int = Field(ge=0)
    by_sensitivity: dict[str, int] = Field(alias="bySensitivity")
    sanitized_image_sha256: str = Field(alias="sanitizedImageSha256", pattern=r"^[0-9a-f]{64}$")


class SanitizedObservation(StrictModel):
    schema_version: Literal["1.0"] = Field(alias="schemaVersion")
    session_id: str = Field(alias="sessionId", min_length=1, max_length=64)
    step_id: int = Field(alias="stepId", ge=0, le=15)
    observation_version: str = Field(alias="observationVersion", min_length=1, max_length=80)
    goal: str = Field(min_length=1, max_length=2048)
    page: Page
    elements: list[ElementSnapshot] = Field(max_length=200)
    redaction: RedactionSummary
