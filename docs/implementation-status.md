# Implementation status — 0.1.0-rc1

| Component | Status | Evidence / limitation |
|---|---|---|
| Chrome MV3 extension | Complete for controlled RC scope | Five fresh persistent-Chromium launches in `artifacts/browser-smoke-report.json` |
| UI detector | Packaged and browser executed | UI6 SHA-256 `0cbc2a4f006db44860572932b8f66edfb3c30c104a46fbfc1193ba4d07e42ee9`; Kaggle v19 COMPLETE; held-out synthetic site-disjoint AP50:95 0.726, AP50 0.995 |
| OCR candidate detection | Packaged and browser executed | PP-OCRv3 hash and WASM provider recorded in browser report; not transcription/accuracy proof |
| Face detection/masking | Packaged and browser executed | UltraFace hash, WASM provider, and sanitized output recorded; no fairness claim |
| DOM tokenization / password exclusion / egress firewall | Implemented and tested | Production-code tests and fixed evaluation report |
| Action schema, validation, confirmation | Implemented for constrained action envelope | Invalid/injection fixtures rejected; arbitrary script/selectors unsupported |
| Controlled fixture | Complete | Five independent behavior runs in `artifacts/demo-gate-report.json` |
| Qwen3-VL | Batch evidence complete; deployment incomplete | Kaggle v5: 20/20 strict valid, 2/2 adversarial rejection, CPU fallback. Not persistent API/vLLM |
| Default planner | Deterministic mock | Deliberately labelled; persistent Qwen is not implied |
| Performance | Measured only where available | Synthetic microbenchmarks plus five browser local-privacy round trips include p50/p95/worst; no end-to-end planner/task latency claim |
| Release evidence | Complete for RC | SPDX SBOMs, license inventory, final architecture/security docs, SHA-256 manifest, deterministic archive and release check |

Run `pnpm verify`, then `pnpm release:prepare` and `pnpm release:check`. Generated evidence is host/run specific; JSON reports are authoritative.
