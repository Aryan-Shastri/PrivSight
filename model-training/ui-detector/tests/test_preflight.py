from __future__ import annotations
import json
import subprocess
import sys
from pathlib import Path

SCRIPT = Path(__file__).parents[1] / "preflight.py"

def run(tmp_path: Path, metadata: dict, make_inputs: bool = False):
    work = tmp_path / "work"; work.mkdir()
    (work / "kernel-metadata.json").write_text(json.dumps(metadata))
    (work / "data.yaml").write_text("path: /kaggle/input/privsight-ui-six-class\n")
    inputs = tmp_path / "input"; inputs.mkdir()
    if make_inputs:
        dataset = inputs / "privsight-ui-six-class"; dataset.mkdir()
        for split in ("images/train", "images/val", "labels/train", "labels/val", "train2017", "val2017", "annotations"):
            (dataset / split).mkdir(parents=True)
        weights = inputs / "privsight-yolox-apache-text"; weights.mkdir()
        (weights / "yolox_nano.pth.b64").write_bytes(b"x" * 10259940)
        (weights / "yolox-0.3.0.tar.gz.b64").write_bytes(b"x" * 3894892)
        deps = inputs / "privsight-yolox-offline-deps"; deps.mkdir()
        (deps / "manifest.json").write_text("{}")
    return subprocess.run([sys.executable, str(SCRIPT), "--directory", str(work), "--input-root", str(inputs)], text=True, capture_output=True)

def base():
    return {"id":"aryanshastri/privsight-six-class-local-ui-detector-export","is_private":True,"enable_internet":False,"dataset_sources":[]}

def test_refuses_unconfigured_dependencies(tmp_path):
    result=run(tmp_path,base())
    assert result.returncode != 0
    assert "DATASET_SOURCES_MISSING" in result.stderr

def test_refuses_missing_mounted_dependencies(tmp_path):
    metadata=base();metadata["dataset_sources"]=["owner/privsight-ui-six-class","owner/privsight-yolox-apache-text","owner/privsight-yolox-offline-deps"]
    result=run(tmp_path,metadata)
    assert result.returncode != 0
    assert "DATASET_DIRECTORY_MISSING" in result.stderr

def test_accepts_private_offline_complete_inputs(tmp_path):
    metadata=base();metadata["dataset_sources"]=["owner/privsight-ui-six-class","owner/privsight-yolox-apache-text","owner/privsight-yolox-offline-deps"]
    result=run(tmp_path,metadata,True)
    assert result.returncode == 0
    assert "PREFLIGHT_OK" in result.stdout
