import hashlib
import json

import httpx
import pytest
from fastapi.testclient import TestClient

from app.api.agent import get_planner
from app.config import Settings
from app.main import app
from app.schemas.observation import SanitizedObservation
from app.vlm.client import PlannerError, VLLMPlanner
from tests.test_agent import PNG, metadata, post


class FakeUpstream:
    """Deterministic OpenAI-compatible upstream used by contract tests."""
    def __init__(self, outputs, statuses=None):
        self.outputs = iter(outputs)
        self.statuses = iter(statuses or [])
        self.calls = 0

    async def __call__(self, request: httpx.Request) -> httpx.Response:
        self.calls += 1
        assert request.headers.get("authorization") == "Bearer test-key"
        try:
            status = next(self.statuses)
        except StopIteration:
            status = 200
        if status != 200:
            return httpx.Response(status, json={"error": "sensitive upstream detail"})
        return httpx.Response(200, json={"choices": [{"message": {"content": next(self.outputs)}}]})


VALID_ACTIONS = [
    {"type": "CLICK", "elementId": "E001"},
    {"type": "TYPE_TEXT", "elementId": "E001", "text": "safe"},
    {"type": "TYPE_TOKEN", "elementId": "E001", "token": "[EMAIL_1]"},
    {"type": "SELECT", "elementId": "E001", "option": "one"},
    {"type": "CHECK", "elementId": "E001"},
    {"type": "UNCHECK", "elementId": "E001"},
    {"type": "SCROLL", "direction": "DOWN", "amountPx": 100},
    {"type": "WAIT", "milliseconds": 10},
    {"type": "ASK_USER", "message": "confirm"},
    {"type": "DONE", "summary": "complete"},
] * 2


@pytest.mark.parametrize("case", VALID_ACTIONS)
def test_20_case_http_contract(case) -> None:
    class Planner:
        label = "QWEN_VLLM"
        async def plan(self, observation, image, media_type):
            from pydantic import TypeAdapter
            from app.schemas.action import AgentAction
            return TypeAdapter(AgentAction).validate_python(case)
    app.dependency_overrides[get_planner] = lambda: Planner()
    try:
        response = post(TestClient(app), metadata())
    finally:
        app.dependency_overrides.clear()
    assert response.status_code == 200
    assert response.json() == {"planner": "QWEN_VLLM", "action": case}


INVALID_ACTIONS = [
    {}, {"type": "NOPE"}, {"type": "CLICK"},
    {"type": "CLICK", "elementId": "E999"},
    {"type": "CLICK", "elementId": "E001", "extra": 1},
    {"type": "WAIT", "milliseconds": 0},
    {"type": "WAIT", "milliseconds": 5001},
    {"type": "SCROLL", "direction": "LEFT", "amountPx": 1},
    {"type": "SCROLL", "direction": "UP", "amountPx": 801},
    {"type": "TYPE_TOKEN", "elementId": "E001", "token": "secret"},
] * 5


@pytest.mark.asyncio
@pytest.mark.parametrize("case", INVALID_ACTIONS)
async def test_50_case_adversarial_upstream_rejection(case) -> None:
    fake = FakeUpstream([json.dumps(case)])
    client = httpx.AsyncClient(transport=httpx.MockTransport(fake), headers={"Authorization": "Bearer test-key"})
    planner = VLLMPlanner("http://private/v1", "model", api_key="test-key", client=client, retries=0)
    with pytest.raises(PlannerError):
        await planner.plan(SanitizedObservation.model_validate(metadata()), PNG, "image/png")
    await client.aclose()


def test_qwen_mode_requires_private_credentials() -> None:
    with pytest.raises(ValueError):
        Settings(planner_mode="QWEN_VLLM", vllm_api_key=None)


@pytest.mark.asyncio
async def test_bounded_retry_recovers_once() -> None:
    fake = FakeUpstream([json.dumps({"type": "CLICK", "elementId": "E001"})], statuses=[503, 200])
    client = httpx.AsyncClient(transport=httpx.MockTransport(fake), headers={"Authorization": "Bearer test-key"})
    planner = VLLMPlanner("http://private/v1", "model", api_key="test-key", client=client, retries=1, retry_backoff=0)
    action = await planner.plan(SanitizedObservation.model_validate(metadata()), PNG, "image/png")
    assert action.type == "CLICK"
    assert fake.calls == 2
    await client.aclose()
