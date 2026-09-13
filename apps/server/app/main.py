import json
import logging
import time
from collections import defaultdict, deque
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app.api.agent import router as agent_router
from app.config import get_settings
from app.vlm.client import VLLMPlanner

app = FastAPI(title="PrivSight API", version="1.0.0", docs_url=None, redoc_url=None)
app.include_router(agent_router)
_hits: dict[str, deque[float]] = defaultdict(deque)


def _safe_log(event: dict) -> None:
    logging.getLogger("privsight.request").info(json.dumps(event, separators=(",", ":"), sort_keys=True))


@app.middleware("http")
async def security_boundary(request: Request, call_next):
    settings = get_settings()
    request_id = request.headers.get("x-request-id")
    if not request_id or len(request_id) > 128 or any(ord(c) < 32 for c in request_id):
        request_id = str(uuid4())
    request.state.request_id = request_id
    started = time.monotonic()
    content_length = request.headers.get("content-length")
    if content_length:
        try:
            if int(content_length) > settings.max_request_bytes:
                return JSONResponse(status_code=413, content={"error": {"code": "BODY_TOO_LARGE", "message": "Request body exceeds the allowed size", "retryable": False}}, headers={"x-request-id": request_id})
        except ValueError:
            return JSONResponse(status_code=400, content={"error": {"code": "INVALID_CONTENT_LENGTH", "message": "Invalid Content-Length", "retryable": False}}, headers={"x-request-id": request_id})
    if request.url.path.startswith("/api/"):
        key = request.client.host if request.client else "unknown"
        now = time.monotonic()
        window = _hits[key]
        while window and window[0] <= now - 60:
            window.popleft()
        if len(window) >= settings.rate_limit_per_minute:
            return JSONResponse(status_code=429, content={"error": {"code": "RATE_LIMITED", "message": "Rate limit exceeded", "retryable": True}}, headers={"retry-after": "60", "x-request-id": request_id})
        window.append(now)
    response = await call_next(request)
    response.headers["x-request-id"] = request_id
    response.headers["x-content-type-options"] = "nosniff"
    response.headers["cache-control"] = "no-store"
    _safe_log({"event": "request_complete", "request_id": request_id, "method": request.method,
               "path": request.url.path, "status": response.status_code,
               "duration_ms": int((time.monotonic() - started) * 1000)})
    return response


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/ready")
async def ready():
    settings = get_settings()
    if settings.planner_mode == "MOCK":
        return {"status": "ready", "planner": "MOCK PLANNER"}
    planner = VLLMPlanner(settings.vllm_base_url, settings.vllm_model, settings.vllm_api_key,
                          connect_timeout=settings.vllm_connect_timeout_seconds,
                          read_timeout=min(settings.vllm_read_timeout_seconds, 5))
    try:
        if not await planner.ready():
            return JSONResponse(status_code=503, content={"status": "not_ready", "planner": "QWEN_VLLM"})
        return {"status": "ready", "planner": "QWEN_VLLM"}
    finally:
        await planner.close()
