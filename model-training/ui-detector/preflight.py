from __future__ import annotations
import argparse
import json
import sys
from pathlib import Path
from typing import NoReturn

from input_layout import resolve_dataset

REQUIRED_DATASET = "privsight-ui-six-class"
REQUIRED_WEIGHTS = "privsight-yolox-apache-text"
REQUIRED_DEPENDENCIES = "privsight-yolox-offline-deps"
REQUIRED_SPLITS = ("images/train", "images/val", "labels/train", "labels/val", "train2017", "val2017", "annotations")

def fail(code: str) -> NoReturn:
    raise SystemExit(f"PREFLIGHT_ERROR:{code}")

def main() -> None:
    parser=argparse.ArgumentParser(description="Fail-closed Kaggle UI-detector dependency validation")
    parser.add_argument("--directory",type=Path,default=Path(__file__).parent)
    parser.add_argument("--input-root",type=Path,default=Path("/kaggle/input"))
    args=parser.parse_args()
    metadata_path=args.directory/"kernel-metadata.json"
    if not metadata_path.is_file(): fail("KERNEL_METADATA_MISSING")
    metadata=json.loads(metadata_path.read_text())
    if metadata.get("id") != "aryanshastri/privsight-six-class-local-ui-detector-export": fail("KERNEL_OWNER_OR_ID_INVALID")
    if metadata.get("is_private") is not True: fail("PRIVATE_KERNEL_REQUIRED")
    if metadata.get("enable_internet") is not False: fail("OFFLINE_KERNEL_REQUIRED")
    sources=metadata.get("dataset_sources")
    if not isinstance(sources,list) or not sources: fail("DATASET_SOURCES_MISSING")
    if any("CHANGE_ME" in source or "/" not in source for source in sources): fail("DATASET_SOURCE_INVALID")
    by_slug={source.rsplit("/",1)[-1]:source for source in sources}
    if REQUIRED_DATASET not in by_slug: fail("TRAINING_DATASET_SOURCE_MISSING")
    if REQUIRED_WEIGHTS not in by_slug: fail("WEIGHTS_DATASET_SOURCE_MISSING")
    if REQUIRED_DEPENDENCIES not in by_slug: fail("DEPENDENCIES_DATASET_SOURCE_MISSING")
    try:
        dataset=resolve_dataset(args.input_root, REQUIRED_DATASET, REQUIRED_SPLITS)
        weights=resolve_dataset(args.input_root, REQUIRED_WEIGHTS, ("yolox_nano.pth.b64", "yolox-0.3.0.tar.gz.b64"))
        resolve_dataset(args.input_root, REQUIRED_DEPENDENCIES, ("manifest.json",))
    except RuntimeError as error:
        fail(f"DATASET_DIRECTORY_MISSING:{error}")
    for split in REQUIRED_SPLITS:
        if not (dataset/split).is_dir(): fail(f"DATASET_SPLIT_MISSING:{split}")
    checkpoint=weights/"yolox_nano.pth.b64"
    source=weights/"yolox-0.3.0.tar.gz.b64"
    if not checkpoint.is_file() or checkpoint.stat().st_size != 10259940: fail("YOLOX_CHECKPOINT_TRANSPORT_INVALID")
    if not source.is_file() or source.stat().st_size != 3894892: fail("YOLOX_SOURCE_TRANSPORT_INVALID")
    print(json.dumps({"status":"PREFLIGHT_OK","kernel":metadata["id"],"private":True,"internet":False,"datasetSource":by_slug[REQUIRED_DATASET],"weightsSource":by_slug[REQUIRED_WEIGHTS]}))

if __name__ == "__main__":
    try: main()
    except (OSError,json.JSONDecodeError) as error:
        print(f"PREFLIGHT_ERROR:{type(error).__name__}:{error}",file=sys.stderr)
        raise SystemExit(2)
