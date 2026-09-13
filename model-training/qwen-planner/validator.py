"""Dependency-free validator for PrivSight's single-action contract."""
from __future__ import annotations

import json
import re
from typing import Any

ELEMENT_ID = re.compile(r"^[EV]\d{3,4}$")
TOKEN = re.compile(r"^\[(PASSWORD|OTP|PIN|CVV|EMAIL|PHONE|PERSON|ADDRESS|CARD|ACCOUNT|GOV_ID)_\d+\]$")
KEYS = {
    "CLICK": {"type", "elementId"},
    "TYPE_TEXT": {"type", "elementId", "text"},
    "TYPE_TOKEN": {"type", "elementId", "token"},
    "SELECT": {"type", "elementId", "option"},
    "CHECK": {"type", "elementId"},
    "UNCHECK": {"type", "elementId"},
    "SCROLL": {"type", "direction", "amountPx"},
    "WAIT": {"type", "milliseconds"},
    "ASK_USER": {"type", "message"},
    "DONE": {"type", "summary"},
}


def extract_json(text: str) -> Any:
    """Parse a bare JSON object, allowing only surrounding whitespace."""
    decoder = json.JSONDecoder()
    value, end = decoder.raw_decode(text.lstrip())
    if text.lstrip()[end:].strip():
        raise ValueError("response contains text outside the JSON object")
    return value


def validate_action(value: Any, allowed_element_ids: set[str] | None = None) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ValueError("action must be one JSON object")
    action_type = value.get("type")
    if action_type not in KEYS:
        raise ValueError("unknown action type")
    if set(value) != KEYS[action_type]:
        raise ValueError(f"fields must be exactly {sorted(KEYS[action_type])}")

    element_id = value.get("elementId")
    if element_id is not None:
        if not isinstance(element_id, str) or not ELEMENT_ID.fullmatch(element_id):
            raise ValueError("invalid elementId")
        if allowed_element_ids is not None and element_id not in allowed_element_ids:
            raise ValueError("elementId is not present in the current observation")

    if action_type == "TYPE_TEXT":
        _bounded_string(value["text"], 1, 2000, "text")
    elif action_type == "TYPE_TOKEN":
        if not isinstance(value["token"], str) or not TOKEN.fullmatch(value["token"]):
            raise ValueError("invalid token")
    elif action_type == "SELECT":
        _bounded_string(value["option"], 1, 512, "option")
    elif action_type == "SCROLL":
        if value["direction"] not in {"UP", "DOWN"}:
            raise ValueError("invalid direction")
        if type(value["amountPx"]) is not int or not 1 <= value["amountPx"] <= 800:
            raise ValueError("amountPx must be an integer in [1, 800]")
    elif action_type == "WAIT":
        if type(value["milliseconds"]) is not int or not 1 <= value["milliseconds"] <= 5000:
            raise ValueError("milliseconds must be an integer in [1, 5000]")
    elif action_type == "ASK_USER":
        _bounded_string(value["message"], 1, 512, "message")
    elif action_type == "DONE":
        _bounded_string(value["summary"], 1, 512, "summary")
    return value


def validate_downstream_policy(
    action: dict[str, Any], sensitive_element_ids: set[str] | None = None
) -> dict[str, Any]:
    """Reject schema-valid actions that bypass observation privacy policy."""
    sensitive_element_ids = sensitive_element_ids or set()
    if action.get("type") == "TYPE_TEXT" and action.get("elementId") in sensitive_element_ids:
        raise ValueError("plaintext text is forbidden for a sensitive element; use TYPE_TOKEN")
    return action


def _bounded_string(value: Any, minimum: int, maximum: int, field: str) -> None:
    if not isinstance(value, str) or not minimum <= len(value) <= maximum:
        raise ValueError(f"{field} length must be in [{minimum}, {maximum}]")
