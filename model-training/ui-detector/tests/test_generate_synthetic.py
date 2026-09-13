from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

SCRIPT = Path(__file__).parents[1] / "generate_synthetic.py"
CLASSES = ["button", "checkbox", "text_input", "dropdown", "icon", "text_region"]


def test_generator_is_reproducible_valid_and_session_separated(tmp_path: Path):
    outputs = [tmp_path / "first", tmp_path / "second"]
    for output in outputs:
        result = subprocess.run(
            [sys.executable, str(SCRIPT), "--output", str(output), "--train-sessions", "3", "--val-sessions", "2", "--images-per-session", "2", "--seed", "42"],
            text=True,
            capture_output=True,
        )
        assert result.returncode == 0, result.stderr

    manifests = [json.loads((output / "provenance.json").read_text()) for output in outputs]
    assert manifests[0] == manifests[1]
    assert manifests[0]["license"] == "CC0-1.0"
    assert manifests[0]["classes"] == CLASSES
    assert set(manifests[0]["splits"]["train"]["sessions"]).isdisjoint(manifests[0]["splits"]["val"]["sessions"])

    for split, count in (("train", 6), ("val", 4)):
        images = sorted((outputs[0] / "images" / split).glob("*.png"))
        labels = sorted((outputs[0] / "labels" / split).glob("*.txt"))
        assert len(images) == len(labels) == count
        seen = set()
        for label in labels:
            for line in label.read_text().splitlines():
                values = line.split()
                assert len(values) == 5
                class_id = int(values[0]); seen.add(class_id)
                x, y, width, height = map(float, values[1:])
                assert 0 < width <= 1 and 0 < height <= 1
                assert width / 2 <= x <= 1 - width / 2
                assert height / 2 <= y <= 1 - height / 2
        assert seen == set(range(6))

    first_hashes = json.loads((outputs[0] / "checksums.json").read_text())
    second_hashes = json.loads((outputs[1] / "checksums.json").read_text())
    assert first_hashes == second_hashes
    for split, count in (("train", 6), ("val", 4)):
        coco = json.loads((outputs[0] / "annotations" / f"instances_{split}.json").read_text())
        assert len(coco["images"]) == count
        assert len(coco["annotations"]) == count * 6
        assert [category["name"] for category in coco["categories"]] == CLASSES
