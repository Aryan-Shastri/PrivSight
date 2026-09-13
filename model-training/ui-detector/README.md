# Six-class UI detector handoff

This directory contains a reproducible first experiment, not a benchmark claim or a checked-in model.

## Fixed synthetic dataset

Generate the exact 320-image corpus (256 train, 64 validation):

```bash
python3 generate_synthetic.py --output generated/privsight-ui-six-class \
  --train-sessions 32 --val-sessions 8 --images-per-session 8 --seed 42
uv run --with pytest pytest tests -q
```

Each image has YOLO labels for `button`, `checkbox`, `text_input`, `dropdown`, `icon`, and `text_region`. Site/session IDs are disjoint across splits. `provenance.json`, `checksums.json`, and `LICENSE.txt` record deterministic inputs, file hashes, and CC0-1.0 provenance. COCO mirrors are included only because upstream YOLOX trains on COCO annotations.

Generated data and downloaded weights live under ignored `generated/`; do not commit them.

## Baseline provenance

The offline baseline is official YOLOX-Nano from Megvii-BaseDetection/YOLOX (Apache-2.0):

- checkpoint: `https://github.com/Megvii-BaseDetection/YOLOX/releases/download/0.1.1rc0/yolox_nano.pth`
- SHA-256: `cd28f55fbbc1829f99d9ac9b38a16d259a22889739c8728ea877610201feff7b`
- YOLOX 0.3.0 source SHA-256: `972ddb9cb13d508fac3738e814449327cec29bc55fbd8a125c67d9080edfc02d`

The private Kaggle transport dataset base64-encodes these files because Kaggle rejected direct PyTorch-weight uploads during asynchronous processing. `train_export.py` decodes and hash-checks the checkpoint before use.

## Exact private Kaggle dependencies

- `aryanshastri/privsight-ui-six-class`
- `aryanshastri/privsight-yolox-apache-text`

`kernel-metadata.json` keeps the kernel private, GPU-enabled, and Internet-disabled. Validate mounts and launch:

```bash
python3 preflight.py --input-root .kaggle-input
uvx --from kaggle kaggle kernels push --path .
uvx --from kaggle kaggle kernels status aryanshastri/privsight-six-class-local-ui-detector-export
```

The run trains YOLOX-Nano for 30 epochs at 416 px and writes `privsight-ui6.onnx`, its SHA-256 file, and `export-metadata.json`. The YOLOX export is a raw detector output, not an NMS-wrapped Ultralytics output. Integrate nothing until `validate_export.py` and `sha256sum -c` pass against downloaded output and the consumer supports this output contract. No metrics are claimed by this handoff.
