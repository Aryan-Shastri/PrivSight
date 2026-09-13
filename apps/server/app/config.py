from functools import lru_cache
from typing import Literal
from urllib.parse import urlsplit

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="PRIVSIGHT_", extra="ignore", case_sensitive=False)
    planner_mode: Literal["MOCK", "QWEN_VLLM"] = "MOCK"
    vllm_base_url: str = "http://127.0.0.1:8001/v1"
    vllm_model: str = "Qwen/Qwen3-VL-8B-Instruct"
    vllm_model_revision: str = "0c351dd01ed87e9c1b53cbc748cba10e6187ff3b"
    vllm_api_key: str | None = Field(default=None, repr=False)
    vllm_connect_timeout_seconds: float = Field(default=3.0, gt=0, le=30)
    vllm_read_timeout_seconds: float = Field(default=30.0, gt=0, le=120)
    vllm_retries: int = Field(default=1, ge=0, le=2)
    vllm_retry_backoff_seconds: float = Field(default=0.1, ge=0, le=2)
    max_request_bytes: int = Field(default=1_800_000, ge=1_500_000, le=5_000_000)
    rate_limit_per_minute: int = Field(default=600, ge=1, le=6000)

    @model_validator(mode="after")
    def secure_qwen(self):
        if self.planner_mode == "QWEN_VLLM":
            if not self.vllm_api_key:
                raise ValueError("QWEN_VLLM mode requires PRIVSIGHT_VLLM_API_KEY")
            parsed = urlsplit(self.vllm_base_url)
            if parsed.scheme not in {"http", "https"} or not parsed.hostname:
                raise ValueError("VLLM base URL must be HTTP(S)")
            if parsed.username or parsed.password or parsed.query or parsed.fragment:
                raise ValueError("VLLM base URL must not embed credentials, query, or fragment")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
