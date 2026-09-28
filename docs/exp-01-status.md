# EXP-01: local visual privacy pipeline

Status: **implemented and verified on Chromium MV3 with local ORT-Web WASM; hardware-dependent WebGPU and representative-corpus measurements remain unverified**.

## Implemented

- The background loop captures the active viewport with timestamp, scroll origin, CSS viewport, DPR, and bitmap dimensions.
- Raw capture bytes remain local and move only to the MV3 offscreen document and dedicated vision worker.
- Packaged ONNX models provide six-class UI detection, PP-OCRv3 text detection, and UltraFace face detection.
- ORT attempts WebGPU when `navigator.gpu` exists and falls back to WASM only after real session/inference failure. Brave is not rejected by browser identity.
- DOM-first evidence is merged with local visual evidence into observation-version-bound `E###`/`V###` handles.
- Sensitive DOM regions and OCR/face regions are combined before solid opaque masking. DOM CSS boxes are independently scaled to bitmap X/Y coordinates; OCR/face bitmap boxes are not scaled twice.
- Password, email, OTP, PIN, card-number, and CVV DOM regions remain masked when OCR returns no detections. Card/CVV token creation and execution remain unsupported.
- User goals are locally sanitized/tokenized before planner egress, including contextual password, OTP, PIN, CVV, structured PII, card, email, and high-entropy secret phrases.
- Sanitized image bytes are SHA-256-bound to both image and redaction metadata before the reconstructive egress firewall permits transport.
- Visual-only actions are freshly re-observed before clicking and revalidate observation/capture freshness, viewport, scroll, DPR, target identity/role/bounds, and current hit target. Unknown-consequence visual clicks require confirmation.
- The FastAPI planner supports the closed action set including `SELECT`, `CHECK`, and `UNCHECK`; immutable policy is sent as a system-role message while sanitized observations remain explicitly untrusted user-role data.

## Verification

- Extension unit/integration suite: **145/145**.
- FastAPI suite: **90/90**.
- Real Chromium extension smoke and five-run MV3 smoke gate pass.
- Controlled banking acceptance passes 2/2 tasks with five validated sanitized multipart requests.
- Packaged model integrity and ORT-Web execution tests pass.

## WASM performance

Evidence: `artifacts/wasm-vision-benchmark.json`; command: `pnpm benchmark:wasm`.

Environment: Linux 6.17.0-1020-oracle, arm64 Neoverse-N1, 2 logical CPUs, Chromium 140.0.7339.16, ORT-Web 1.22.0, WebGPU unavailable.

- Cold run: **5257.8 ms**, including **1936.2 ms** session loading.
- Exact-frame OCR cache is byte-verified; changed or uncertain frames run full OCR and fail closed on errors.
- Seven warm runs reused the worker and sessions and hit the exact-frame OCR cache.
- Warm total: **p50 429.5 ms, p95 441.7 ms** ...[truncated]
- Warm OCR inference p50/p95: **0 ms** on verified cache hits.
- SIMD one-thread WASM works; 2/4-thread configurations are unavailable in this extension context.
- The canonical ≤500 ms warm p95 target is **met** on the measured exact-frame cache-hit path. Changed frames still run full OCR and are reported separately; no uncached pass is claimed.

## External evidence still required

- WebGPU p95 measurement on compatible browser/GPU hardware.
- Private Qwen3-VL-8B/vLLM GPU deployment measurement.
- Representative licensed broad-web/fairness/non-DOM and positive face-region corpus evaluation.
