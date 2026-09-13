# Privacy candidate-region models

Integrated into the Chrome MV3 extension's local offscreen/dedicated-worker privacy pipeline. The source-validation tools in this directory remain standalone.

## Selected artifacts

- **OCR regions:** OpenCV Zoo's English PP-OCRv3 detector, Apache-2.0, 2.42 MB. Its graph is spatially dynamic; this profile deliberately fixes invocation to `1x3x736x736` and output to a `736x736` probability heatmap.
- **Faces:** upstream UltraFace RFB-320, MIT, 1.27 MB. It has a fixed `1x3x240x320` input and fixed `scores [1,4420,2]` / `boxes [1,4420,4]` outputs.

Both URLs are immutable commit-pinned authoritative repository paths. Exact hashes, provenance, licenses, preprocessing, and contracts are in `manifests/models.json`.

## Reproduce

```sh
uv venv .venv
uv pip install --python .venv/bin/python -r requirements.txt
.venv/bin/python model_tools.py fetch
.venv/bin/python model_tools.py validate
.venv/bin/pytest -q
.venv/bin/python evaluate_fixtures.py --iterations 20
```

Downloads and generated results remain under ignored `.cache/` and `output/`. The evaluator uses one ORT CPU thread, three warmups, fixed thresholds, a generated synthetic OCR image, and a commit-pinned image from the face model repository. It is a deterministic smoke/masking fixture, not an accuracy benchmark. Latency varies by host.

## Browser-inference status and remaining validation

- Both packaged artifacts load and execute their fixed contracts under ONNX Runtime Web 1.22.0's WASM execution provider in Node. A real Chromium extension session was not run on this host because no Chromium/Chrome executable is installed.
- WebGPU is attempted first and falls back to WASM, but actual browser WebGPU execution remains unverified. PP-OCRv3's graph metadata is dynamic; the extension enforces a fixed `1x3x736x736` invocation.
- UltraFace's old-exporter initializer-as-input warnings are emitted under ORT-Web WASM but inference succeeds. A cleaned derivative is not currently required.
- The fixtures do not establish recall, demographic fairness, or privacy safety. The extension applies conservative padding and fails closed on model loading, integrity, inference, or output-contract errors.

## Kaggle conversion

No conversion was needed: both selected artifacts are authoritative ONNX files and validate locally. Therefore no Kaggle upload/kernel was created. If browser compatibility forces a derivative export, perform it in a private Kaggle kernel, emit the source SHA-256, tool versions, output SHA-256, ONNX checker report, and fixed-contract inference results; do not publish the kernel or dataset.
