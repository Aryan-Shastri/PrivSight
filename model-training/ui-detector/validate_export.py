from __future__ import annotations
import argparse
import hashlib
from pathlib import Path
import onnx

CLASSES = ["button", "checkbox", "text_input", "dropdown", "icon", "text_region"]
p = argparse.ArgumentParser()
p.add_argument("model", type=Path)
p.add_argument("--sha256", help="expected digest from Kaggle output")
a = p.parse_args()
raw = a.model.read_bytes()
digest = hashlib.sha256(raw).hexdigest()
if a.sha256 and digest != a.sha256.lower(): raise SystemExit("SHA256_MISMATCH")
model = onnx.load_model_from_string(raw)
onnx.checker.check_model(model)
if any(t.data_location == onnx.TensorProto.EXTERNAL for t in model.graph.initializer): raise SystemExit("EXTERNAL_MODEL_DATA_FORBIDDEN")
if len(model.graph.input) != 1 or not model.graph.output: raise SystemExit("INVALID_IO_CONTRACT")
print(f"sha256={digest}\nclasses={','.join(CLASSES)}\nonnx=valid")
