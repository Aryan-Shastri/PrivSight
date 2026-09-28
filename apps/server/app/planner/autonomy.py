from ..schemas.action import AgentAction, AskUser, Click, TypeText, TypeToken
from ..schemas.observation import SanitizedObservation


def normalize_autonomous_action(observation: SanitizedObservation, action: AgentAction) -> AgentAction:
    """Correct narrow model failures without inventing data or targets."""
    visible = [element for element in observation.elements if element.visible and element.enabled]
    submits = [element for element in visible if element.role.lower() == "submit"]
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
