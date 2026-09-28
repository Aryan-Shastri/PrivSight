from app.planner.autonomy import normalize_autonomous_action
from app.schemas.action import AskUser, Click, TypeText
from app.schemas.observation import SanitizedObservation
from tests.test_agent import metadata


def observation() -> SanitizedObservation:
    value = metadata(elements=[
        {"id":"E001","role":"textbox","label":"Email","value":"[EMAIL_1]","enabled":True,"visible":True,"source":"DOM"},
        {"id":"E002","role":"button","label":"Continue","enabled":True,"visible":True,"source":"DOM"},
    ])
    return SanitizedObservation.model_validate(value)


def test_replaces_javascript_hallucination_with_unique_safe_primary_action():
    result = normalize_autonomous_action(observation(), AskUser(type="ASK_USER", message="Enable JavaScript?"))
    assert result == Click(type="CLICK", elementId="E002")


def test_does_not_retype_an_already_filled_field():
    result = normalize_autonomous_action(observation(), TypeText(type="TYPE_TEXT", elementId="E001", text="[EMAIL_1]"))
    assert result == Click(type="CLICK", elementId="E002")


def test_does_not_guess_when_multiple_primary_controls_exist():
    value = observation().model_dump(by_alias=True)
    value["elements"].append({"id":"E003","role":"button","label":"Cancel","enabled":True,"visible":True,"source":"DOM"})
    obs = SanitizedObservation.model_validate(value)
    action = AskUser(type="ASK_USER", message="Enable JavaScript?")
    assert normalize_autonomous_action(obs, action) == action
