import hashlib
import json

import httpx
import pytest

from app.schemas.observation import SanitizedObservation
from app.vlm.client import ModelCapacityError, VLLMPlanner
from tests.test_agent import PNG, metadata


@pytest.mark.asyncio
async def test_vllm_uses_structured_output_and_parses_one_action() -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        assert body["response_format"]["type"] == "json_schema"
        assert "UNTRUSTED_PAGE_DATA" in body["messages"][0]["content"][0]["text"]
        return httpx.Response(200, json={"choices": [{"message": {"content": '{"type":"CLICK","elementId":"E001"}'}}]})

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    planner = VLLMPlanner("http://private/v1", "model", client=client)
    observation = SanitizedObservation.model_validate(metadata())
    action = await planner.plan(observation, PNG, "image/png")
    assert action.type == "CLICK"
    await client.aclose()


@pytest.mark.asyncio
async def test_vllm_maps_capacity_error_safely() -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(503, text="secret internal model error")

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    planner = VLLMPlanner("http://private/v1", "model", client=client)
    with pytest.raises(ModelCapacityError, match="model capacity unavailable"):
        await planner.plan(SanitizedObservation.model_validate(metadata()), PNG, "image/png")
    await client.aclose()
