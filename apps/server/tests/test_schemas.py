import pytest
from pydantic import TypeAdapter, ValidationError

from app.schemas.action import AgentAction
from app.schemas.observation import SanitizedObservation


def valid_observation() -> dict:
    return {
        "schemaVersion": "1.0", "sessionId": "session-1", "stepId": 0,
        "observationVersion": "obs-1", "goal": "Click continue",
        "page": {"origin": "https://example.test", "title": "Example"},
        "elements": [{"id": "E001", "role": "button", "label": "Continue",
                      "enabled": True, "visible": True, "source": "DOM"}],
        "redaction": {"count": 0, "bySensitivity": {},
                       "sanitizedImageSha256": "a" * 64},
    }


def test_observation_accepts_contract_and_forbids_unknown_fields() -> None:
    parsed = SanitizedObservation.model_validate(valid_observation())
    assert parsed.page.origin == "https://example.test"
    invalid = valid_observation() | {"rawHtml": "secret"}
    with pytest.raises(ValidationError):
        SanitizedObservation.model_validate(invalid)
    invalid = valid_observation()
    invalid["stepId"] = "0"
    with pytest.raises(ValidationError):
        SanitizedObservation.model_validate(invalid)


def test_observation_enforces_origin_and_limits() -> None:
    invalid = valid_observation()
    invalid["page"] = {"origin": "https://example.test/path?q=secret", "title": "x"}
    with pytest.raises(ValidationError):
        SanitizedObservation.model_validate(invalid)
    invalid = valid_observation()
    invalid["elements"] = invalid["elements"] * 201
    with pytest.raises(ValidationError):
        SanitizedObservation.model_validate(invalid)


def test_action_union_is_strict_and_bounded() -> None:
    adapter = TypeAdapter(AgentAction)
    assert adapter.validate_python({"type": "CLICK", "elementId": "E001"}).type == "CLICK"
    for invalid in (
        {"type": "RUN_JS", "code": "alert(1)"},
        {"type": "WAIT", "milliseconds": 5001},
        {"type": "CLICK", "elementId": "missing"},
        {"type": "DONE", "summary": "ok", "extra": True},
    ):
        with pytest.raises(ValidationError):
            adapter.validate_python(invalid)
