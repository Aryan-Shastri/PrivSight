# Third-party software and model license inventory

This inventory covers the release candidate. The SPDX SBOMs in `artifacts/` enumerate locked software package names; `NOASSERTION` is used where lockfiles do not carry license metadata rather than guessing.

## Bundled models and runtime

| Component | Version/source | Use | License | Evidence |
|---|---|---|---|---|
| PrivSight UI6 / YOLOX-Nano | Kaggle kernel v19; YOLOX 0.3.0 baseline | Bundled UI detector | Apache-2.0 | `apps/extension/public/models/privsight-ui6.metadata.json`; YOLOX repository |
| PP-OCRv3 English text detector | OpenCV Zoo commit `47534e27c9851bb1128ccc0102f1145e27f23f98` | Bundled OCR candidate detector | Apache-2.0 | `model-training/privacy-models/manifests/models.json` |
| UltraFace RFB-320 | upstream commit `dffdddda9794a50607cba8f318507a28c1c27cab` | Bundled face detector | MIT | `model-training/privacy-models/manifests/models.json` |
| ONNX Runtime Web | 1.22.0 | Local model runtime | MIT | `pnpm-lock.yaml`, upstream package license |
| Qwen3-VL 2B Instruct | Kaggle model revision `qwen-lm/qwen-3-vl/transformers/2b-instruct/1` | Batch evaluation only; not bundled/deployed | Apache-2.0 | `model-training/qwen-planner/evidence/kaggle-v5/preflight.json` |
| Synthetic UI training corpus | locally generated, seed 42 | Training evidence only; excluded from archive | CC0-1.0 | generator provenance described in `model-training/ui-detector/README.md` |

## Software

JavaScript and Python dependencies are locked in `pnpm-lock.yaml` and `apps/server/uv.lock`. `artifacts/sbom-software.spdx.json` is the consolidated machine-readable package inventory. The direct application dependencies are React/React DOM 19, Zod 4, WXT and its React module, ONNX Runtime Web 1.22.0, FastAPI, Pydantic, Uvicorn, and their locked transitive dependencies. Verify redistribution terms from each package's installed license before production distribution; the SBOM intentionally does not infer licenses absent from lockfile metadata.
