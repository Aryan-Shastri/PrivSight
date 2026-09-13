# Final architecture — release candidate

PrivSight is a Chrome Manifest V3 research MVP. A content scanner and explicit screenshot capture feed an extension-local offscreen document and dedicated worker. Three hash-pinned ONNX models execute locally through ONNX Runtime Web: YOLOX-Nano UI6, PP-OCRv3 candidate-region detection, and UltraFace. OCR and face regions are irreversibly black-filled before a screenshot may cross the egress boundary. DOM sensitive values are represented by local aliases; passwords are unsendable.

The egress firewall reconstructs a sanitized observation from allowed fields instead of filtering a raw object. The server accepts only this schema and returns one constrained action. The extension validates observation version, local element IDs, token aliases, and confirmation policy before local execution. Server responses cannot contain executable JavaScript, CSS selectors, or XPath.

## Trust boundaries

1. **Untrusted page:** DOM, canvas, images, and prompt-injection text.
2. **Trusted extension:** capture, local models, token vault, masking, egress firewall, validator, confirmation, executor.
3. **Planner boundary:** sanitized observation/image only; no raw capture, password, token map, or execution authority.

The default server planner remains deterministic/mock. Qwen3-VL evidence is a finite private Kaggle v5 batch using CPU fallback (20/20 strict valid, 2/2 adversarial rejection), not a persistent planner. No vLLM service is packaged or claimed.

## Evidence boundary

`artifacts/evaluation-report.json` contains fixed synthetic in-process metrics. `artifacts/browser-smoke-report.json` contains five independent real Chromium MV3 extension launches exercising all three packaged ONNX stages with WASM fallback. These runs establish packaging/integration and fail-closed behavior, not real-world model recall, WebGPU compatibility, planner deployment, or broad-site task success.
