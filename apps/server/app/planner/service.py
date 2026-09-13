from app.schemas.action import AgentAction, AskUser, Click, Done
from app.schemas.observation import SanitizedObservation

LABEL = "MOCK PLANNER"


class MockPlanner:
    label = LABEL

    async def plan(self, observation: SanitizedObservation, image: bytes, media_type: str) -> AgentAction:
        goal = observation.goal.casefold().strip()
        if goal in {"done", "finished", "complete"}:
            return Done(type="DONE", summary="Goal is visibly complete")
        for element in observation.elements:
            if element.visible and element.enabled:
                return Click(type="CLICK", elementId=element.id)
        return AskUser(type="ASK_USER", message="No actionable visible element was found")
