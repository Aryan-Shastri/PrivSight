import asyncio
import base64
import json
from typing import Any

import httpx
from pydantic import TypeAdapter, ValidationError

from app.planner.prompt import SYSTEM_PROMPT
from app.schemas.action import AgentAction, TypeText
from app.schemas.observation import SanitizedObservation


class PlannerError(RuntimeError):
    """Safe model error without upstream details."""


class ModelCapacityError(PlannerError):
    pass


def validate_downstream(action: AgentAction, observation: SanitizedObservation) -> AgentAction:
    """Enforce local policy after model schema validation."""
    target = getattr(action, "element_id", None)
    elements = {item.id: item for item in observation.elements}
    if target is not None and target not in elements:
        raise PlannerError("model returned an unknown element")
    if isinstance(action, TypeText) and target is not None:
        element = elements[target]
        sensitive_roles = {"password", "otp", "pin", "cvv", "email", "tel"}
        haystack = f"{element.role} {element.label or ''}".casefold()
        if any(marker in haystack for marker in sensitive_roles):
            raise PlannerError("plaintext is forbidden for a sensitive element")
    return action


class VLLMPlanner:
    label = "QWEN_VLLM"

    def __init__(self, base_url: str, model: str, api_key: str | None = None,
                 timeout: float | None = None, client: httpx.AsyncClient | None = None,
                 connect_timeout: float = 3.0, read_timeout: float = 30.0,
                 retries: int = 1, retry_backoff: float = 0.1):
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.retries = min(max(retries, 0), 2)
        self.retry_backoff = retry_backoff
        effective_read = timeout if timeout is not None else read_timeout
        self.client = client or httpx.AsyncClient(
            timeout=httpx.Timeout(effective_read, connect=connect_timeout),
            limits=httpx.Limits(max_connections=32, max_keepalive_connections=16),
            headers={"Authorization": f"Bearer {api_key}"} if api_key else {},
        )
        self._owns_client = client is None

    async def ready(self) -> bool:
        try:
            response = await self.client.get(f"{self.base_url}/models")
            return response.status_code == 200
        except httpx.HTTPError:
            return False

    async def plan(self, observation: SanitizedObservation, image: bytes, media_type: str) -> AgentAction:
        payload = self._payload(observation, image, media_type)
        last_capacity = False
        for attempt in range(self.retries + 1):
            try:
                response = await self.client.post(f"{self.base_url}/chat/completions", json=payload)
                if response.status_code in {429, 502, 503, 504}:
                    last_capacity = True
                    if attempt < self.retries:
                        await asyncio.sleep(self.retry_backoff * (2 ** attempt))
                        continue
                    raise ModelCapacityError("model capacity unavailable")
                response.raise_for_status()
                content = response.json()["choices"][0]["message"]["content"]
                action = TypeAdapter(AgentAction).validate_json(content)
                return validate_downstream(action, observation)
            except ModelCapacityError:
                raise
            except (httpx.TimeoutException, httpx.NetworkError) as exc:
                if attempt < self.retries:
                    await asyncio.sleep(self.retry_backoff * (2 ** attempt))
                    continue
                raise ModelCapacityError("model capacity unavailable") from exc
            except (httpx.HTTPError, KeyError, IndexError, TypeError, json.JSONDecodeError, ValidationError) as exc:
                raise PlannerError("model response unavailable or invalid") from exc
        raise ModelCapacityError("model capacity unavailable") if last_capacity else PlannerError("model failure")

    def _payload(self, observation: SanitizedObservation, image: bytes, media_type: str) -> dict[str, Any]:
        observation_json = observation.model_dump_json(by_alias=True)
        return {
            "model": self.model,
            "messages": [{"role": "user", "content": [
                {"type": "text", "text": f"{SYSTEM_PROMPT}\nUSER_GOAL and UNTRUSTED_PAGE_DATA:\n{observation_json}"},
                {"type": "image_url", "image_url": {"url": f"data:{media_type};base64,{base64.b64encode(image).decode()}"}},
            ]}],
            "temperature": 0,
            "max_tokens": 512,
            "response_format": {"type": "json_schema", "json_schema": {
                "name": "agent_action", "strict": True,
                "schema": TypeAdapter(AgentAction).json_schema(),
            }},
        }

    async def close(self) -> None:
        if self._owns_client:
            await self.client.aclose()
