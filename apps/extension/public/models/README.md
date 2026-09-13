# Bundled privacy models

These files execute only in the extension's offscreen dedicated worker. Build and test hooks enforce byte length and SHA-256 before packaging; the worker re-hashes fetched `chrome-extension://` bytes before creating ONNX Runtime sessions.

| File | Purpose | Bytes | SHA-256 | License |
|---|---|---:|---|---|
| `privsight-ui6.onnx` | Six-class YOLOX-Nano UI detector | 9,017,538 | `0cbc2a4f006db44860572932b8f66edfb3c30c104a46fbfc1193ba4d07e42ee9` | Apache-2.0 (YOLOX) |
| `text_detection_en_ppocrv3_2023may.onnx` | PP-OCRv3 text candidate regions (not transcription) | 2,423,490 | `03f550c6b406fda8bf54bd8327815f6c7e2edd98cea02348c93d879254366587` | Apache-2.0, PaddlePaddle Authors |
| `version-RFB-320.onnx` | UltraFace RFB-320 face boxes | 1,270,727 | `34cd7e60aeff28744c657de7a3dc64e872d506741de66987f3426f2b79f88017` | MIT, Copyright (c) 2019 linzai |

The immutable upstream commits, source URLs, license evidence, tensor contracts, and normalization formulas are recorded in `model-training/privacy-models/manifests/models.json`.

The privacy path uses fixed 736×736 PP-OCRv3 RGB/ImageNet normalization and fixed 320×240 UltraFace RGB `(pixel-127)/128` normalization. OCR heatmap components and confidence-filtered/NMS face boxes are conservatively padded and black-filled before a PNG can reach the egress firewall. Missing, modified, malformed, or non-runnable models return an error; no raw screenshot is released.

ORT-Web WASM is exercised against all three actual packaged models in the Node test suite and real-browser MV3 smoke gate. WebGPU is attempted first at runtime and WASM is the fallback; the release browser gate forces WASM. This does not establish broad-web model recall, fairness, or browser WebGPU compatibility. UI model held-out synthetic site-disjoint metrics and training provenance are recorded in `privsight-ui6.metadata.json`.
