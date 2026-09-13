import hashlib
import json
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, Request, UploadFile
from fastapi.responses import JSONResponse
from pydantic import ValidationError

from app.config import get_settings
from app.planner.service import MockPlanner
from app.schemas.observation import SanitizedObservation
from app.security.limits import ALLOWED_IMAGES, MAX_IMAGE_BYTES, MAX_METADATA_BYTES, replay_guard
from app.vlm.client import ModelCapacityError, PlannerError, VLLMPlanner

router = APIRouter(prefix="/api/v1/agent")


def error(status: int, code: str, message: str, retryable: bool = False) -> JSONResponse:
    return JSONResponse(status_code=status, content={"error": {"code": code, "message": message, "retryable": retryable}})


def get_planner():
    settings = get_settings()
    if settings.planner_mode == "QWEN_VLLM":
        return VLLMPlanner(
            settings.vllm_base_url, settings.vllm_model, settings.vllm_api_key,
            connect_timeout=settings.vllm_connect_timeout_seconds,
            read_timeout=settings.vllm_read_timeout_seconds,
            retries=settings.vllm_retries,
            retry_backoff=settings.vllm_retry_backoff_seconds,
        )
    return MockPlanner()


@router.post("/step")
async def step(request: Request, metadata: str = Form(...), image: UploadFile = File(...),
               planner=Depends(get_planner)):
    if len(metadata.encode("utf-8")) > MAX_METADATA_BYTES:
        return error(413, "METADATA_TOO_LARGE", "Metadata exceeds the allowed size")
    try:
        observation = SanitizedObservation.model_validate(json.loads(metadata))
    except (json.JSONDecodeError, ValidationError, TypeError):
        return error(422, "INVALID_METADATA", "Metadata validation failed")
    media_type = image.content_type or ""
    signature = ALLOWED_IMAGES.get(media_type)
    if signature is None:
        return error(415, "UNSUPPORTED_IMAGE_TYPE", "Only PNG and JPEG images are accepted")
    image_bytes = await image.read(MAX_IMAGE_BYTES + 1)
    if len(image_bytes) > MAX_IMAGE_BYTES:
        return error(413, "IMAGE_TOO_LARGE", "Image exceeds the allowed size")
    if not image_bytes.startswith(signature):
        return error(415, "INVALID_IMAGE", "Image content does not match its declared type")
    if hashlib.sha256(image_bytes).hexdigest() != observation.redaction.sanitized_image_sha256:
        return error(422, "IMAGE_HASH_MISMATCH", "Sanitized image hash does not match")
    if not await replay_guard.accept(observation.session_id, observation.step_id):
        return error(409, "REPLAYED_STEP", "Session step was already processed")
    try:
        action = await planner.plan(observation, image_bytes, media_type)
    except ModelCapacityError:
        return error(503, "MODEL_CAPACITY", "Planner capacity is unavailable", True)
    except PlannerError:
        return error(502, "MODEL_ERROR", "Planner returned an invalid response", True)
    finally:
        if isinstance(planner, VLLMPlanner):
            await planner.close()
    request_id = getattr(request.state, "request_id", str(uuid4()))
    return JSONResponse(
        content={"planner": planner.label, "action": action.model_dump(by_alias=True)},
        headers={"x-request-id": request_id},
    )
