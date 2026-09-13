from typing import Annotated, Literal, Union

from pydantic import BaseModel, ConfigDict, Field

ElementId = Annotated[str, Field(pattern=r"^[EV]\d{3,4}$")]


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True, strict=True)


class Click(StrictModel):
    type: Literal["CLICK"]
    element_id: ElementId = Field(alias="elementId")


class TypeText(StrictModel):
    type: Literal["TYPE_TEXT"]
    element_id: ElementId = Field(alias="elementId")
    text: str = Field(min_length=1, max_length=2000)


class TypeToken(StrictModel):
    type: Literal["TYPE_TOKEN"]
    element_id: ElementId = Field(alias="elementId")
    token: str = Field(pattern=r"^\[(PASSWORD|OTP|PIN|CVV|EMAIL|PHONE|PERSON|ADDRESS|CARD|ACCOUNT|GOV_ID)_\d+\]$")


class Select(StrictModel):
    type: Literal["SELECT"]
    element_id: ElementId = Field(alias="elementId")
    option: str = Field(min_length=1, max_length=512)


class Check(StrictModel):
    type: Literal["CHECK", "UNCHECK"]
    element_id: ElementId = Field(alias="elementId")


class Scroll(StrictModel):
    type: Literal["SCROLL"]
    direction: Literal["UP", "DOWN"]
    amount_px: int = Field(alias="amountPx", ge=1, le=800)


class Wait(StrictModel):
    type: Literal["WAIT"]
    milliseconds: int = Field(ge=1, le=5000)


class AskUser(StrictModel):
    type: Literal["ASK_USER"]
    message: str = Field(min_length=1, max_length=512)


class Done(StrictModel):
    type: Literal["DONE"]
    summary: str = Field(min_length=1, max_length=512)


AgentAction = Annotated[Union[Click, TypeText, TypeToken, Select, Check, Scroll, Wait, AskUser, Done], Field(discriminator="type")]
