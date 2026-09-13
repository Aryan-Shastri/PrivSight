# PrivSight Qwen planner — EXP-03 / EXP-07

Private Kaggle **batch evaluation**, not a persistent API service. Version 5 runs 20 fixed sanitized observations through the official Apache-2.0 `qwen-lm/qwen-3-vl/transformers/2b-instruct/1` model with internet disabled.

## Structured output and validation

Transformers 5.0.0 in this batch environment does not expose a native JSON-schema/grammar argument for `generate`. The evaluator therefore uses deterministic decoding (`do_sample=False`) plus `prefix_allowed_tokens_fn` backed by a case-specific token trie. Every permitted continuation is a complete action matching the existing action schema and current observation IDs. The decoded continuation is still parsed and validated strictly; there is no key normalization, JSON repair, or fallback replacement.

The downstream policy separately rejects schema-valid `TYPE_TEXT` actions targeting sensitive/tokenized fields. Two fixed adversarial checks demonstrate rejection of an unknown element ID and a plaintext secret.

## Version 5 result

Kernel: `aryanshastri/privsight-qwen3-vl-planner-exp-03-exp-07`, version **5**, private, status `COMPLETE`.

- strict schema/downstream valid: **20/20 (100%)**
- invalid: **0/20**
- adversarial downstream rejections: **2/2**
- assigned accelerator: Tesla P100, compute capability 6.0
- actual execution device: **CPU fallback** because installed PyTorch `2.10.0+cu128` is incompatible with the P100

Downloaded evidence is in `evidence/kaggle-v5/`:

- `preflight.json`: model source, resolved mount, actual GPU/runtime/device state, decoding mechanism
- `raw.jsonl`: verbatim model continuations and latency
- `validated.jsonl`: strict validation result/action/error for all 20 cases
- `rejection_checks.json`: adversarial invalid-ID and plaintext-secret rejections
- `summary.json`: aggregate counts
- `privsight-qwen3-vl-planner-exp-03-exp-07.log`: Kaggle execution log

## Local verification

```bash
python3 -m unittest discover -s model-training/qwen-planner/tests -v
python3 -m py_compile model-training/qwen-planner/run_batch.py model-training/qwen-planner/validator.py
```

## Kaggle lifecycle

```bash
uvx --from kaggle kaggle kernels push -p model-training/qwen-planner
uvx --from kaggle kaggle kernels status aryanshastri/privsight-qwen3-vl-planner-exp-03-exp-07
uvx --from kaggle kaggle kernels output aryanshastri/privsight-qwen3-vl-planner-exp-03-exp-07 -p model-training/qwen-planner/evidence/kaggle-v5 --force
```

This kernel is intentionally finite and does not claim to provide a persistent API. The repository gateway may target a separately operated OpenAI-compatible vLLM server.
