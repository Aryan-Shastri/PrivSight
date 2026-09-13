# Relative 21-day delivery roadmap

The submission date must be confirmed from the official source; days are relative to avoid encoding an unverified deadline.

| Day | Critical deliverable / exit evidence |
|---:|---|
| 1 | Freeze P0 boundaries; MV3/ORT and VLM hardware spikes recorded |
| 2 | Monorepo, protocol schema, extension skeleton, `/health` |
| 3 | Visible DOM scanner tests |
| 4 | Versioned element index and local click |
| 5 | Deterministic one-action server loop |
| 6 | Sensitive semantics and core PII validators |
| 7 | Session token vault and `TYPE_TOKEN` |
| 8 | Reconstructive egress firewall; adversarial tests |
| 9 | Capture coordinate contract and pixel redactor |
| 10 | Bundled local face detection |
| 11 | Candidate OCR plus canvas/image fixture |
| 12 | ONNX WebGPU with WASM fallback baseline |
| 13 | DOM/visual evidence merge |
| 14 | **P0 freeze:** sanitized deterministic full loop |
| 15 | Clearly labelled Qwen/vLLM planner mode |
| 16 | Multi-step and hostile-page integration tests |
| 17 | **Benchmark freeze:** fixed corpus, environment metadata, p50/p95/worst |
| 18 | Fix benchmark/demo blockers only |
| 19 | **Demo freeze:** five consecutive clean runs |
| 20 | Package, SBOM, license inventory, architecture/security material |
| 21 | Buffer; recorded fallback and artifact/hash verification |

Critical path: runtime spike → privacy firewall → sanitized loop → visual evidence → optional Qwen → reproducible benchmark → demo. Qwen deployment must not block Days 2–14. If staffing compresses, cut Firefox, NER, custom detector optimization, and store publication before reducing privacy/security P0.

## Release-candidate classification (Days 17–21)

| Day | Classification | Recorded exit evidence |
|---:|---|---|
| 17 | **COMPLETE** | Fixed corpus, environment/model hashes, synthetic p50/p95/worst, and real-browser local-privacy p50/p95/worst |
| 18 | **COMPLETE** | Stale absent/blocked model reporting fixed; full verification passes |
| 19 | **COMPLETE (controlled scope)** | Five consecutive independent real Chromium MV3 runs plus five fixture behavior runs |
| 20 | **COMPLETE (RC scope)** | SPDX software/model SBOMs, consolidated license inventory, final architecture/security docs, deterministic archive |
| 21 | **COMPLETE (RC scope)** | SHA-256 manifest/archive checksum and automated release check |

Persistent Qwen/vLLM deployment is explicitly **NOT COMPLETE** and is not an exit criterion for this truthful RC. Qwen evidence remains a finite Kaggle v5 CPU-fallback batch.
