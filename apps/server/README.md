# PrivSight FastAPI server

## Run

```bash
uv sync --locked --dev
uv run uvicorn app.main:app --host 127.0.0.1 --port 8000
```

The default deterministic planner is visibly identified as `MOCK PLANNER` in readiness and step responses. To use an OpenAI-compatible vLLM server on a private network:

```bash
PRIVSIGHT_PLANNER_MODE=vllm \
PRIVSIGHT_VLLM_BASE_URL=http://127.0.0.1:8001/v1 \
PRIVSIGHT_VLLM_MODEL=Qwen/Qwen3-VL-8B-Instruct \
uv run uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Optional `PRIVSIGHT_VLLM_API_KEY` is supported, but vLLM must not be exposed publicly. The browser-facing service accepts multipart `metadata` JSON plus one PNG/JPEG `image`, limited to 256 KiB and 1.5 MB respectively, and verifies the sanitized image SHA-256.

## Test

```bash
uv run pytest -q
```
