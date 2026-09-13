# Persistent Qwen/vLLM planner deployment

This package runs the FastAPI gateway, a persistent private vLLM process, and a TLS reverse proxy. It is a deployment recipe only: it has **not** been executed on a GPU in this repository.

## Fixed artifacts

- vLLM image: `vllm/vllm-openai:v0.11.0`
- model: `Qwen/Qwen3-VL-8B-Instruct`
- Hugging Face revision: `0c351dd01ed87e9c1b53cbc748cba10e6187ff3b`
- modes: `PRIVSIGHT_PLANNER_MODE=MOCK` (default) or `QWEN_VLLM`

Review and deliberately update all three pins together. Mirror the image/model internally for reproducible production rollout.

## GPU-host runbook

1. Provision a host supported by the selected vLLM/CUDA image, install NVIDIA Container Toolkit, and confirm `docker run --rm --gpus all nvidia/cuda:12.8.0-base-ubuntu22.04 nvidia-smi` works.
2. Copy `.env.example` to `.env` outside source control. Generate `VLLM_API_KEY` with at least 32 random bytes. Put `fullchain.pem` and `privkey.pem` in a root-readable `TLS_CERT_DIR`; restrict permissions. Do not put credentials in URLs or command history.
3. Pre-fetch the pinned model during a controlled egress window. Set `HF_HUB_OFFLINE=1` after the cache is complete if the environment must be offline.
4. Validate config: `docker compose --env-file .env config --quiet`.
5. Start privately: `docker compose --env-file .env up -d --build`. Only nginx publishes a port; vLLM is restricted to Docker's internal network.
6. Observe startup with `docker compose ps` and sanitized container logs. `/health` means the API process is alive. `/ready` returns 200 only when the configured planner is ready; nginx/vLLM also have health checks.
7. Send a sanitized contract request through the TLS endpoint. Never send raw screenshots, secrets, cookies, full URLs, or unredacted DOM data.
8. Benchmark after warm-up: `python3 benchmark.py --url https://planner.internal -n 20`. Capture GPU type, driver, CUDA, concurrency, and model pins with results.
9. Roll back by restoring the prior compose/image/model pins, then `docker compose up -d`. Rotate the vLLM key after suspected exposure.

## Security and operations

The gateway enforces strict Pydantic input/action schemas, PNG/JPEG signatures and hashes, metadata/image/whole-body limits, local action policy, bounded retry/backoff, split connect/read timeouts, no-store responses, request IDs, and structured metadata-only logs. Prompts, observations, image bytes, credentials, model output, and upstream error bodies are never logged or returned. Nginx terminates TLS, caps bodies/rates, and applies upstream timeouts. vLLM's API key is defense in depth; vLLM remains unreachable from the edge network because not every vLLM endpoint is guaranteed to be protected by that key.

The in-process rate limiter is per API process and intended as a second boundary. Keep the nginx/shared edge limiter authoritative when scaling API replicas. Do not add vLLM port mappings. Restrict `/health` and `/ready` to internal monitoring at the network layer if topology disclosure matters.

## Local non-GPU validation

```bash
cd apps/server && uv run pytest
PRIVSIGHT_PLANNER_MODE=MOCK uv run uvicorn app.main:app --host 127.0.0.1 --port 8080
python3 ../../deploy/qwen-vllm/benchmark.py --url http://127.0.0.1:8080 -n 20
```

The deterministic fake upstream tests execute 20 valid HTTP contract cases and 50 adversarial model responses without model or network dependencies.
