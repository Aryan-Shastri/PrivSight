# EXP-01: local visual privacy pipeline

Status: **live capture and fail-closed pipeline wired; egress remains blocked until validated local OCR and face model artifacts are bundled**.

Implemented and tested:

- the background agent loop now captures the active viewport PNG plus trigger, timestamp, scroll origin, CSS viewport, DPR, and bitmap dimensions; the placeholder PNG path was removed;
- raw capture bytes are sent only to the MV3 offscreen document, decoded locally, and transferred as RGBA to the packaged ONNX Runtime Web worker;
- UI inference uses a local extension-relative `.onnx` path and WebGPU-first/WASM-fallback runtime; remote model/runtime paths are rejected;
- the orchestration boundary merges DOM and visual detections, assigns deterministic visual IDs, binds every item to its observation version, derives DOM/OCR/face privacy regions, requires irreversible redaction, runs egress approval, and only then calls the network client;
- candidate-region OCR and bundled/local-only face detector interfaces are present with deterministic test doubles;
- integration tests assert raw image bytes cannot reach the network dependency, redaction precedes approval, visual IDs are version-bound, and detector/runtime failures prevent egress;
- the server planner remains explicitly labelled `MOCK PLANNER`; it is not represented as a production planner.

Current fail-closed blocker:

- no validated UI detector, OCR, or face detector weights are committed. The offscreen path attempts the local UI ONNX stage, but missing/invalid UI runtime/model output blocks immediately; if UI inference succeeds, mandatory OCR currently returns `OCR_MODEL_UNAVAILABLE`. Therefore the live loop cannot egress screenshots in this repository state. No model weights, training results, quality metrics, hashes, latency results, or browser inference evidence are claimed.

Packaging/security notes:

- ONNX Runtime WASM is packaged locally by the extension build;
- no large model binary was added;
- a real browser end-to-end success smoke test remains blocked on validated bundled model artifacts and concrete OCR/face implementations.
