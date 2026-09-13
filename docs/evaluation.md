# Reproducible evaluation and release

```bash
pnpm verify                 # tests, typecheck/build, benchmark, fixture gate, five real MV3 runs
pnpm release:prepare        # SPDX SBOMs, hash manifest, deterministic ZIP, checks
pnpm release:check          # non-mutating final release validation
```

Evidence:

- `artifacts/evaluation-report.json`: fixed synthetic corpus using production privacy/action code, model artifact discovery/hashes, and in-process p50/p95/worst.
- `artifacts/demo-gate-report.json`: five controlled fixture behavior runs and accurate integrated-stage references.
- `artifacts/browser-smoke-report.json`: five consecutive independent persistent-Chromium MV3 launches, three packaged ONNX models through ORT-Web WASM, sanitized output/fail-closed checks, and local privacy request p50/p95/worst.
- `model-training/qwen-planner/evidence/kaggle-v5/`: separate finite Qwen batch evidence. It is not a persistent API or vLLM deployment.

Reports include environment/model/build identities where available. This repository has no commit, so `gitCommit` is null; the SHA-256 manifest identifies release inputs instead. Browser latency covers the measured local privacy request only, not planner or full task latency. Missing/unmeasured capabilities remain explicit rather than being inferred from packaging.

`release:prepare` uses fixed ZIP member timestamps/order and excludes Git metadata, secrets, Kaggle credentials, dependency directories, caches, virtual environments, and generated training corpora. Re-running it over identical inputs yields the same archive hash.
