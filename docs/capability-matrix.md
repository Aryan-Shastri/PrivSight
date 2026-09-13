# Capability and evidence matrix — 0.1.0-rc1

| Capability | RC classification | Evidence / caveat |
|---|---|---|
| Controlled registration | PASS | Five fixture runs |
| Text aliases/password exclusion | PASS in controlled scope | Fixed production-code corpus; no real identities |
| UI detection | PASS for packaged integration | UI6 executes in real MV3 browser; synthetic held-out AP50:95 0.726/AP50 0.995 is not broad-web accuracy |
| OCR candidates | PASS for packaged integration | Browser WASM execution; candidate regions only |
| Face masking | PASS for packaged integration | Browser WASM execution and modified sanitized PNG; no fairness/recall benchmark |
| Prompt-injection/action validation | PASS for fixed corpus | 0 silent consequential hostile actions; 0 invalid actions executed |
| Egress firewall/fail closed | PASS for tested paths | No planner request for invalid browser capture |
| Qwen output evaluation | PASS as finite batch only | Kaggle v5 20/20 strict schema/downstream valid and 2/2 adversarial rejected; CPU fallback |
| Persistent Qwen/vLLM planner | NOT COMPLETE | No persistent deployment, availability, auth, or latency evidence |
| Five-run MV3 gate | PASS | `artifacts/browser-smoke-report.json`, fresh process/context each run |
| End-to-end arbitrary-site task success | NOT MEASURED | Controlled fixture only |
| WebGPU | NOT VERIFIED | Browser gate deliberately forces WASM |
| Release package/compliance evidence | PASS for RC | SPDX SBOMs, licenses, hash manifest, deterministic ZIP, release checker |

Exact p50/p95/worst values are generated in the JSON reports and are not copied here because runtime values change by host. Synthetic in-process timings and browser local-privacy round-trip timings are separate metrics.
