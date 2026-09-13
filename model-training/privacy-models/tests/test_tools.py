import json
from pathlib import Path

import numpy as np
import pytest

from model_tools import contract_from_model, validate_artifact
from evaluate_fixtures import nms, percentile_nearest_rank

ROOT = Path(__file__).parents[1]


def test_nearest_rank_percentile_is_deterministic():
    assert percentile_nearest_rank([9, 1, 4, 2], 50) == 2
    assert percentile_nearest_rank([9, 1, 4, 2], 95) == 9


def test_nms_suppresses_overlapping_lower_score():
    boxes = np.array([[0, 0, 10, 10], [1, 1, 9, 9], [20, 20, 30, 30]], dtype=np.float32)
    scores = np.array([0.9, 0.8, 0.7], dtype=np.float32)
    assert nms(boxes, scores, 0.3) == [0, 2]


def test_validate_rejects_hash_mismatch(tmp_path):
    artifact = tmp_path / "not-a-model.onnx"
    artifact.write_bytes(b"bad")
    manifest = {"sha256": "0" * 64, "bytes": 3}
    with pytest.raises(ValueError, match="SHA-256"):
        validate_artifact(artifact, manifest)


def test_checked_models_match_declared_contracts():
    manifest = json.loads((ROOT / "manifests" / "models.json").read_text())
    for entry in manifest["models"]:
        path = ROOT / entry["artifact_path"]
        report = validate_artifact(path, entry)
        assert report["contract"] == entry["contract"]["graph"]
        assert contract_from_model(path) == entry["contract"]["graph"]
