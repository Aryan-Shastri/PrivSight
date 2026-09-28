import re

from ..schemas.action import AgentAction, AskUser, Click, TypeText, TypeToken
from ..schemas.observation import SanitizedObservation


def normalize_autonomous_action(observation: SanitizedObservation, action: AgentAction) -> AgentAction:
    """Correct narrow model failures without inventing data or targets."""
    visible = [element for element in observation.elements if element.visible and element.enabled]
    submits = [element for element in visible if element.role.lower() == "submit"]
    missing_sensitive = [element for element in visible if element.role.lower() == "textbox" and not element.value and re.search(r"password|passcode|one[- ]?time|otp|\bpin\b", element.label or "", re.I)]
    if len(submits) == 1 and missing_sensitive:
        label=(missing_sensitive[0].label or "sensitive value").lower()
        kind="password" if "password" in label or "passcode" in label else "one-time code" if "otp" in label or "one-time" in label else "PIN"
        return AskUser(type="ASK_USER", message=f"Enter the required {kind} locally, then continue.")
    filled = [element for element in visible if element.role.lower() == "textbox" and element.value]
    if len(submits) == 1 and filled:
        return Click(type="CLICK", elementId=submits[0].id)
    buttons = [element for element in visible if element.role.lower() in {"button", "submit"}]
    if len(buttons) != 1:
        return action
    primary = buttons[0]
    if isinstance(action, AskUser) and "javascript" in action.message.lower():
        return Click(type="CLICK", elementId=primary.id)
    if isinstance(action, (TypeText, TypeToken)):
        target = next((element for element in observation.elements if element.id == action.element_id), None)
        if target is not None and target.value:
            return Click(type="CLICK", elementId=primary.id)
    return action
