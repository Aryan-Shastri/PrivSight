import hashlib
import json
from uuid import uuid4

from fastapi.testclient import TestClient

from app.api.agent import get_planner
from app.main import app
from app.vlm.client import ModelCapacityError

PNG = b"\x89PNG\r\n\x1a\n" + b"sanitized pixels"


def metadata(**updates: object) -> dict:
    value = {
        "schemaVersion": "1.0", "sessionId": f"session-{uuid4()}", "stepId": 1,
        "observationVersion": "obs-1", "goal": "Click continue",
        "page": {"origin": "https://example.test", "title": "Example"},
        "elements": [{"id": "E001", "role": "button", "label": "Continue",
                      "enabled": True, "visible": True, "source": "DOM"}],
        "redaction": {"count": 1, "bySensitivity": {"HIGH": 1},
                       "sanitizedImageSha256": hashlib.sha256(PNG).hexdigest()},
    }
    value.update(updates)
    return value


def post(client: TestClient, value: dict, image: bytes = PNG,
         content_type: str = "image/png"):
    return client.post("/api/v1/agent/step", data={"metadata": json.dumps(value)},
                       files={"image": ("capture.png", image, content_type)})


def test_step_returns_deterministic_labelled_mock_action() -> None:
    response = post(TestClient(app), metadata())
    assert response.status_code == 200
    assert response.json()["planner"] == "MOCK PLANNER"
    assert response.json()["action"] == {"type": "CLICK", "elementId": "E001"}
    assert response.headers["x-request-id"]


def test_step_rejects_hash_mismatch_without_echoing_private_input() -> None:
    value = metadata(goal="TOP SECRET goal")
    value["redaction"]["sanitizedImageSha256"] = "0" * 64
    response = post(TestClient(app), value)
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "IMAGE_HASH_MISMATCH"
    assert "TOP SECRET" not in response.text


def test_step_rejects_unsupported_image_type_and_magic() -> None:
    response = post(TestClient(app), metadata(), b"<svg>bad</svg>", "image/svg+xml")
    assert response.status_code == 415
    assert response.json()["error"]["code"] == "UNSUPPORTED_IMAGE_TYPE"
    response = post(TestClient(app), metadata(), b"not png", "image/png")
    assert response.status_code == 415
    assert response.json()["error"]["code"] == "INVALID_IMAGE"


def test_step_enforces_image_and_metadata_body_limits() -> None:
    huge = PNG + b"x" * (1_500_000 - len(PNG) + 1)
    value = metadata()
    value["redaction"]["sanitizedImageSha256"] = hashlib.sha256(huge).hexdigest()
    response = post(TestClient(app), value, huge)
    assert response.status_code == 413
    assert response.json()["error"]["code"] == "IMAGE_TOO_LARGE"
    response = TestClient(app).post(
        "/api/v1/agent/step", data={"metadata": "x" * (256 * 1024 + 1)},
        files={"image": ("capture.png", PNG, "image/png")})
    assert response.status_code == 413
    assert response.json()["error"]["code"] == "METADATA_TOO_LARGE"


def test_step_maps_malformed_metadata_to_safe_error() -> None:
    response = TestClient(app).post(
        "/api/v1/agent/step", data={"metadata": "{bad"},
        files={"image": ("capture.png", PNG, "image/png")})
    assert response.status_code == 422
    assert response.json() == {"error": {"code": "INVALID_METADATA", "message": "Metadata validation failed", "retryable": False}}


def test_step_rejects_replayed_session_step_pair() -> None:
    client = TestClient(app)
    value = metadata(sessionId="replay-session", stepId=7)
    assert post(client, value).status_code == 200
    response = post(client, value)
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "REPLAYED_STEP"


def test_step_maps_model_capacity_error_without_details() -> None:
    class BrokenPlanner:
        label = "PRIVATE VLLM"

        async def plan(self, *args):
            raise ModelCapacityError("do not expose upstream details")

    app.dependency_overrides[get_planner] = lambda: BrokenPlanner()
    try:
        response = post(TestClient(app), metadata())
    finally:
        app.dependency_overrides.clear()
    assert response.status_code == 503
    assert response.json() == {"error": {"code": "MODEL_CAPACITY", "message": "Planner capacity is unavailable", "retryable": True}}
    assert "upstream" not in response.text
