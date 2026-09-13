# Final security assessment — release candidate

## Enforced controls

- MV3 extension CSP permits local scripts and WASM only; no remote executable code is required.
- UI, OCR, and face ONNX artifacts are byte/hash checked before build and in the worker before session creation.
- Raw screenshots remain local; OCR/face candidates are black-filled before egress.
- Sensitive DOM values use aliases; password values are excluded.
- The egress firewall is reconstructive and fail closed.
- Planner output is a strict one-action schema; local IDs/version/tokens and confirmation policy are revalidated locally.
- Invalid local-vision input returns an error and sends no planner request.
- Release checking rejects secret filenames, dependency/cache/training-corpus paths, remote script/link URLs, stale hashes, incomplete smoke evidence, and malformed SBOM headers.

## Validation evidence

The full verification runs extension, server, and model-tooling tests; typecheck/build; fixed evaluation; controlled fixture gate; and five fresh persistent-Chromium MV3 launches. The browser gate exercises all three ONNX stages under WASM, confirms offscreen context creation and a sanitized image, and confirms zero planner requests on the fail-closed case. Exact run data and measured local privacy request latency are in `artifacts/browser-smoke-report.json`.

## Residual risks / unsupported claims

This is a controlled research MVP, not approved for real sensitive accounts. The synthetic UI benchmark does not establish performance on arbitrary websites. OCR is candidate-region detection, not transcription. Model fairness and adversarial robustness are not established. Browser WebGPU is not proven (the release gate forces WASM). Qwen Kaggle v5 is batch/CPU fallback only; persistent vLLM availability, latency, authentication, and production hardening are unverified. No Firefox parity, store review, penetration test, reproducible model training audit, or production key-management assessment is claimed.
