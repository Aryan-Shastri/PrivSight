"""Modal GPU deployment for PrivSight Qwen3-VL planner."""
import modal

APP_NAME = "privsight-qwen3-vl"
MODEL_ID = "Qwen/Qwen3-VL-4B-Instruct"

image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install(
        "fastapi==0.116.1", "python-multipart==0.0.20", "pydantic==2.11.7",
        "torch==2.8.0", "torchvision==0.23.0", "transformers==4.57.1", "accelerate==1.10.1",
        "pillow==11.3.0", "qwen-vl-utils==0.0.14",
    )
    .add_local_dir("apps/server/app", remote_path="/root/privsight_app")
)
app = modal.App(APP_NAME, image=image)
cache = modal.Volume.from_name("privsight-hf-cache", create_if_missing=True)

@app.function(
    gpu="T4",
    timeout=300,
    scaledown_window=300,
    volumes={"/root/.cache/huggingface": cache},
    max_containers=1,
)
@modal.concurrent(max_inputs=4)
@modal.asgi_app()
def api():
    import base64
    import hashlib
    import io
    import json
    import sys
    from typing import Any

    import torch
    from fastapi import FastAPI, File, Form, UploadFile
    from fastapi.responses import HTMLResponse, JSONResponse
    from PIL import Image
    from pydantic import TypeAdapter, ValidationError
    from transformers import AutoProcessor, Qwen3VLForConditionalGeneration

    sys.path.insert(0, "/root")
    from privsight_app.planner.prompt import SYSTEM_PROMPT
    from privsight_app.schemas.action import AgentAction
    from privsight_app.schemas.observation import SanitizedObservation

    web = FastAPI(title="PrivSight Qwen3-VL Planner", docs_url=None, redoc_url=None)
    action_adapter = TypeAdapter(AgentAction)
    model = None
    processor = None

    def fail(status: int, code: str, retryable: bool = False):
        return JSONResponse(status_code=status, content={"error":{"code":code,"message":"Planner request failed","retryable":retryable}})

    def load_model():
        nonlocal model, processor
        if model is None:
            processor = AutoProcessor.from_pretrained(MODEL_ID, trust_remote_code=False)
            model = Qwen3VLForConditionalGeneration.from_pretrained(
                MODEL_ID, torch_dtype=torch.float16, device_map="cuda", trust_remote_code=False
            ).eval()
        return model, processor

    def generate(observation: SanitizedObservation, image_bytes: bytes) -> Any:
        mdl, proc = load_model()
        pil = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        observation_json = observation.model_dump_json(by_alias=True)
        strict_policy = SYSTEM_PROMPT + """
OUTPUT CONTRACT (mandatory): return one JSON object only, with uppercase type and exact camelCase keys.
Allowed forms:
{"type":"CLICK","elementId":"E001"}
{"type":"TYPE_TEXT","elementId":"E001","text":"safe text"}
{"type":"TYPE_TOKEN","elementId":"E001","token":"[PASSWORD_1]"}
{"type":"SELECT","elementId":"E001","option":"visible option"}
{"type":"CHECK","elementId":"E001"}
{"type":"UNCHECK","elementId":"E001"}
{"type":"SCROLL","direction":"DOWN","amountPx":500}
{"type":"WAIT","milliseconds":500}
{"type":"ASK_USER","message":"question"}
{"type":"DONE","summary":"completed"}
Do not use keys named action, element, id, target, selector, or coordinates. Do not wrap JSON in markdown.
"""
        messages = [
            {"role":"system","content":[{"type":"text","text":strict_policy}]},
            {"role":"user","content":[
                {"type":"text","text":"SANITIZED_USER_GOAL_AND_UNTRUSTED_PAGE_DATA:\n"+observation_json},
                {"type":"image","image":pil},
            ]},
        ]
        inputs = proc.apply_chat_template(messages, tokenize=True, add_generation_prompt=True, return_dict=True, return_tensors="pt").to("cuda")
        with torch.inference_mode():
            output = mdl.generate(**inputs, max_new_tokens=256, do_sample=False)
        text = proc.batch_decode(output[:, inputs.input_ids.shape[1]:], skip_special_tokens=True)[0].strip()
        if text.startswith("```"):
            text = text.removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        action = action_adapter.validate_json(text)
        target = getattr(action, "element_id", None)
        if target is not None and target not in {e.id for e in observation.elements}:
            raise ValueError("invalid target")
        return action

    @web.get("/", response_class=HTMLResponse)
    async def ui():
        return HTMLResponse("""<!doctype html><meta charset=utf-8><title>PrivSight Qwen3-VL</title>
<style>body{font:16px system-ui;max-width:860px;margin:40px auto;padding:0 20px;background:#0b1020;color:#e8eefc}textarea,input,button,pre{width:100%;box-sizing:border-box;margin:8px 0;padding:12px;border-radius:8px}textarea,pre{min-height:180px;background:#151d33;color:#e8eefc}button{background:#6366f1;color:white;border:0;font-weight:700}.warn{color:#fbbf24}</style>
<h1>PrivSight Qwen3-VL Planner</h1><p class=warn>Submit only locally sanitized metadata and pixels. Never upload raw screenshots, credentials or PII.</p>
<form id=f><textarea id=m placeholder="SanitizedObservation JSON" required></textarea><input id=i type=file accept="image/png,image/jpeg" required><button>Plan</button></form><pre id=o>Ready.</pre>
<script>f.onsubmit=async(e)=>{e.preventDefault();o.textContent='Planning…';let d=new FormData();d.append('metadata',m.value);d.append('image',i.files[0]);let r=await fetch('/api/v1/agent/step',{method:'POST',body:d});o.textContent=JSON.stringify(await r.json(),null,2)}</script>""")

    @web.get("/health")
    async def health():
        return {"status":"ok","planner":"QWEN3_VL_4B_MODAL"}

    @web.get("/ready")
    async def ready():
        return {"status":"ready","planner":"QWEN3_VL_4B_MODAL"}

    @web.post("/api/v1/agent/step")
    async def step(metadata: str = Form(...), image: UploadFile = File(...)):
        if len(metadata.encode()) > 262144:
            return fail(413,"METADATA_TOO_LARGE")
        try:
            observation = SanitizedObservation.model_validate_json(metadata)
        except ValidationError:
            return fail(422,"INVALID_METADATA")
        media = image.content_type or ""
        signature = {"image/png":b"\x89PNG\r\n\x1a\n","image/jpeg":b"\xff\xd8\xff"}.get(media)
        if signature is None:
            return fail(415,"UNSUPPORTED_IMAGE_TYPE")
        raw = await image.read(1_500_001)
        if len(raw)>1_500_000:
            return fail(413,"IMAGE_TOO_LARGE")
        if not raw.startswith(signature):
            return fail(415,"INVALID_IMAGE")
        if hashlib.sha256(raw).hexdigest()!=observation.redaction.sanitized_image_sha256:
            return fail(422,"IMAGE_HASH_MISMATCH")
        try:
            action=generate(observation,raw)
            return {"planner":"QWEN3_VL_4B_MODAL","action":action.model_dump(by_alias=True)}
        except Exception as exc:
            print("MODEL_ERROR", type(exc).__name__, flush=True)
            return fail(502,"MODEL_ERROR",True)

    return web
