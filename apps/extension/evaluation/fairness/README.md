# Licensed broad-web and fairness evaluation

This directory supplies **readiness infrastructure, not evidence of broad-web performance or fairness**. The bundled two-item corpus exists only to exercise formats and code paths. It is self-generated/CC0 and is too small for claims; the representative policy intentionally returns machine-readable `BLOCKED`.

## Data contract

`schemas/corpus-manifest.schema.json` requires per item:

- provenance (source URL, collection time, collector, method, SHA-256) and explicit license/attribution;
- `train`, `validation`, or `test`, plus stable site and session IDs;
- language(s), LTR/RTL/mixed direction, normal/high/forced-color contrast, zoom, accessibility modes, and explicit subgroup labels;
- zero or more `ui`, `text`, `face`, or `sensitive` regions as `[x,y,width,height]`. Sensitive regions require a type.

Do not use `UNASSIGNED` imported metadata in a benchmark. Review it, annotate regions/context, assign site/session/splits, then validate. Keep a source license copy where its terms require one.

## Commands

From this directory:

```sh
python3 scripts/evaluation_framework.py validate fixtures/manifest.json
python3 scripts/evaluation_framework.py leakage fixtures/manifest.json
python3 scripts/evaluation_framework.py evaluate fixtures/manifest.json \
  --predictions fixtures/predictions.json --policy fixtures/readiness-policy.json
python3 scripts/evaluation_framework.py import /path/to/licensed/source /path/to/new/corpus \
  --license-id CC-BY-4.0 \
  --license-url https://creativecommons.org/licenses/by/4.0/ \
  --source-url https://publisher.example/dataset \
  --attribution 'Dataset author'
python3 -m unittest discover -s tests -v
```

Import only user-provided datasets you are authorized to use. The importer refuses missing license/provenance arguments, ignores symlinks, copies regular files deterministically, computes hashes, and emits a manifest requiring human annotation. It does not download or infer a license.

## Leakage and metrics

The leakage check sorts output deterministically and fails if a content hash, site ID, or session ID spans splits. Run it before scoring. Metrics use class-matched region IoU >= 0.5 and report TP/FP/FN plus precision and recall per class and per context/subgroup tag. A zero denominator is `null`, never silently perfect.

Policy fields:

- `minimum_samples`: required corpus item count;
- `minimum_samples_per_subgroup`: required item count for each required subgroup (defaults to 1);
- `required_subgroups`: exact generated tags such as `language:ar`, `direction:rtl`, `contrast:high`, `zoom:200`, `accessibility:keyboard-only`, or `subgroup:...`;
- `privacy_classes` and `privacy_min_recall`: missing/undefined/below-threshold privacy recall produces `FAIL` with `privacy_fail_closed: true`.

Absent sample size or required subgroup returns status `BLOCKED`, code `INSUFFICIENT_EVIDENCE`, `claims_permitted: false`, observed/required counts, and missing tags. `BLOCKED` is a successful evaluation execution, not a passing benchmark. A `PASS` means only that the supplied policy and annotations passed; claims still require a licensed, representative corpus and documented statistical design.
