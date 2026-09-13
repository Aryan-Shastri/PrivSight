from __future__ import annotations

import hashlib
import json
import os
import base64
import importlib
import re
from pathlib import Path
import shutil
import subprocess
import sys
import tarfile
import zipfile


def resolve_dataset(input_root: Path, slug: str, required: tuple[str, ...]) -> Path:
    candidates = [input_root / slug]
    slug_dirs = [path for path in input_root.rglob(slug) if path.is_dir()]
    candidates.extend(path for path in slug_dirs if path not in candidates)
    candidates.extend(
        version
        for slug_dir in slug_dirs
        for version in (slug_dir / "versions").glob("*")
        if version.is_dir() and version not in candidates
    )
    for candidate in candidates:
        if all((candidate / relative).exists() for relative in required):
            return candidate
    raise RuntimeError(
        f"unable to resolve Kaggle dataset {slug}; required={required}; "
        f"candidates={[str(path) for path in candidates]}"
    )


INPUT_ROOT = Path("/kaggle/input")
DATASET = resolve_dataset(
    INPUT_ROOT,
    "privsight-ui-six-class",
    ("annotations/instances_train.json", "annotations/instances_val.json"),
)
BASELINE = resolve_dataset(
    INPUT_ROOT,
    "privsight-yolox-apache-text",
    ("yolox_nano.pth.b64", "yolox-0.3.0.tar.gz.b64"),
)
DEPENDENCIES = resolve_dataset(INPUT_ROOT, "privsight-yolox-offline-deps", ("manifest.json",))
TRAINED = resolve_dataset(INPUT_ROOT, "privsight-ui6-trained-checkpoint", ("best_ckpt.pth", "training-metadata.json"))
OFFLINE_SITE = Path("/kaggle/working/offline-site")
OFFLINE_SITE.mkdir(parents=True, exist_ok=True)
wheel_archives = list(DEPENDENCIES.rglob("*.whl"))
if not wheel_archives:
    bundles = list(DEPENDENCIES.rglob("wheels.zip"))
    if len(bundles) != 1:
        raise RuntimeError(f"expected offline wheels or one wheels.zip, found {len(bundles)}")
    wheel_dir = Path("/kaggle/working/offline-wheels")
    with zipfile.ZipFile(bundles[0]) as archive:
        archive.extractall(wheel_dir)
    wheel_archives = list(wheel_dir.rglob("*.whl"))
manifest = json.loads((DEPENDENCIES / "manifest.json").read_text())
expected = {entry["file"]: entry["sha256"] for entry in manifest["packages"]}
if {path.name for path in wheel_archives} != set(expected):
    raise RuntimeError("offline wheelhouse manifest mismatch")
for wheel in wheel_archives:
    if hashlib.sha256(wheel.read_bytes()).hexdigest() != expected[wheel.name]:
        raise RuntimeError(f"offline wheel hash mismatch: {wheel.name}")
    with zipfile.ZipFile(wheel) as archive:
        archive.extractall(OFFLINE_SITE)
sys.path.insert(0, str(OFFLINE_SITE))
for module in ("torch", "torchvision", "cv2", "numpy", "loguru", "ninja", "pycocotools", "thop", "tensorboard", "onnx"):
    importlib.import_module(module)
coco_api = OFFLINE_SITE / "pycocotools/coco.py"
coco_text = coco_api.read_text()
coco_old = "res.dataset['info'] = copy.deepcopy(self.dataset['info'])"
if coco_old not in coco_text:
    raise RuntimeError("pycocotools offline compatibility patch mismatch")
coco_api.write_text(coco_text.replace(coco_old, "if 'info' in self.dataset: res.dataset['info'] = copy.deepcopy(self.dataset['info'])"))
WORK_DATA = Path("/kaggle/working/ui6-data")
SOURCE = Path("/kaggle/working/YOLOX-0.3.0")
for required in ("images/train", "images/val", "labels/train", "labels/val", "train2017", "val2017", "annotations"):
    if not (DATASET / required).is_dir():
        raise RuntimeError(f"missing dataset path: {required}")
WORK_DATA.mkdir(parents=True, exist_ok=True)
for name in ("images", "labels", "train2017", "val2017"):
    (WORK_DATA / name).symlink_to(DATASET / name, target_is_directory=True)
(WORK_DATA / "annotations").mkdir()
for annotation in ("instances_train.json", "instances_val.json"):
    source = DATASET / "annotations" / annotation
    if not source.is_file():
        raise RuntimeError(f"missing COCO annotation: {annotation}")
    payload = json.loads(source.read_text())
    payload.setdefault("info", {"description": "PrivSight six-class site-disjoint UI dataset"})
    (WORK_DATA / "annotations" / annotation).write_text(json.dumps(payload))
offline_files = {}
for required, size in (("yolox_nano.pth.b64", 10259940), ("yolox-0.3.0.tar.gz.b64", 3894892)):
    candidates = list(BASELINE.rglob(required))
    if len(candidates) != 1 or candidates[0].stat().st_size != size:
        raise RuntimeError(f"invalid offline dependency: {required}")
    offline_files[required] = candidates[0]

checkpoint = Path("/kaggle/working/yolox_nano.pth")
source_archive = Path("/kaggle/working/yolox-0.3.0.tar.gz")
checkpoint.write_bytes(base64.b64decode(offline_files["yolox_nano.pth.b64"].read_bytes()))
source_archive.write_bytes(base64.b64decode(offline_files["yolox-0.3.0.tar.gz.b64"].read_bytes()))
if hashlib.sha256(checkpoint.read_bytes()).hexdigest() != "cd28f55fbbc1829f99d9ac9b38a16d259a22889739c8728ea877610201feff7b":
    raise RuntimeError("baseline checkpoint hash mismatch")
with tarfile.open(source_archive) as archive:
    archive.extractall("/kaggle/working", filter="data")

def source_patch(relative: str, replacements: tuple[tuple[str, str], ...]) -> None:
    path = SOURCE / relative
    text = path.read_text()
    for old, new in replacements:
        if old not in text:
            raise RuntimeError(f"offline CPU compatibility patch mismatch: {relative}")
        text = text.replace(old, new)
    path.write_text(text)

# YOLOX 0.3.0 assumes CUDA throughout. Kaggle's current GPU image cannot run
# kernels on its assigned device, so use this hash-bound CPU compatibility layer.
source_patch("yolox/core/trainer.py", (
    ('self.device = "cuda:{}".format(self.local_rank)', 'self.device = "cpu"'),
    ('torch.cuda.set_device(self.local_rank)\n        model = self.exp.get_model()', 'model = self.exp.get_model()'),
))
(SOURCE / "yolox/data/data_prefetcher.py").write_text('''class DataPrefetcher:
    def __init__(self, loader):
        self.loader = iter(loader)
    def next(self):
        try:
            input, target, _, _ = next(self.loader)
            return input, target
        except StopIteration:
            return None, None
''')
source_patch("yolox/exp/yolox_base.py", (("torch.LongTensor(2).cuda()", "torch.LongTensor(2)"),))
source_patch("yolox/evaluators/coco_evaluator.py", (
    ("torch.cuda.HalfTensor if half else torch.cuda.FloatTensor", "torch.HalfTensor if half else torch.FloatTensor"),
    ("torch.cuda.FloatTensor([inference_time, nms_time, n_samples])", "torch.FloatTensor([inference_time, nms_time, n_samples])"),
))
source_patch("tools/eval.py", (
    ("torch.cuda.set_device(rank)\n    model.cuda(rank)", "model.cpu()"),
    ('loc = "cuda:{}".format(rank)', 'loc = "cpu"'),
))
source_patch("tools/export_onnx.py", (
    ("torch.load(ckpt_file, map_location=\"cpu\")", "torch.load(ckpt_file, map_location=\"cpu\", weights_only=False)"),
    ("torch.onnx._export(", "torch.onnx.export("),
    ("opset_version=args.opset,\n    )", "opset_version=args.opset,\n        dynamo=False,\n    )"),
))
env = dict(os.environ, PYTHONPATH=os.pathsep.join((str(OFFLINE_SITE), str(SOURCE))))
exp_file = Path("/kaggle/working/ui6_exp.py")
exp_file.write_text(f'''from yolox.exp import Exp as YOLOXExp
class Exp(YOLOXExp):
    def __init__(self):
        super().__init__()
        self.num_classes=6; self.depth=0.33; self.width=0.25; self.depthwise=True
        self.input_size=(416,416); self.test_size=(416,416); self.random_size=(10,20)
        self.data_dir={str(WORK_DATA)!r}
        self.train_ann="instances_train.json"; self.val_ann="instances_val.json"
        self.max_epoch=30; self.warmup_epochs=1; self.no_aug_epochs=5; self.eval_interval=1; self.data_num_workers=2
        self.output_dir="/kaggle/working/YOLOX_outputs"; self.exp_name="ui6_nano"
''')
best = TRAINED / "best_ckpt.pth"
training_metadata = json.loads((TRAINED / "training-metadata.json").read_text())
if hashlib.sha256(best.read_bytes()).hexdigest() != training_metadata["checkpoint_sha256"]:
    raise RuntimeError("trained checkpoint hash mismatch")
artifact = Path("/kaggle/working/privsight-ui6.onnx")
subprocess.run([
    sys.executable, str(SOURCE / "tools/export_onnx.py"), "--output-name", str(artifact),
    "-f", str(exp_file), "-c", str(best), "--opset", "18", "--no-onnxsim"
], check=True, env=env)
import onnx
model = onnx.load(str(artifact)); onnx.checker.check_model(model)
digest = hashlib.sha256(artifact.read_bytes()).hexdigest()
Path("/kaggle/working/privsight-ui6.sha256").write_text(f"{digest}  {artifact.name}\n")
Path("/kaggle/working/export-metadata.json").write_text(json.dumps({
    "sha256": digest,
    "classes": ["button", "checkbox", "text_input", "dropdown", "icon", "text_region"],
    "input": [1, 3, 416, 416], "opset": 18, "trained": True,
    "architecture": "YOLOX-Nano", "upstream_license": "Apache-2.0",
    "held_out_metrics": {"split": training_metadata["held_out_split"], "coco_ap_50_95": training_metadata["coco_ap50_95"], "coco_ap_50": training_metadata["coco_ap50"]},
    "training_kernel": training_metadata["training_kernel"],
    "checkpoint_sha256": training_metadata["checkpoint_sha256"],
    "baseline_sha256": "cd28f55fbbc1829f99d9ac9b38a16d259a22889739c8728ea877610201feff7b"
}, indent=2))
print(f"ARTIFACT={artifact}\nSHA256={digest}")
