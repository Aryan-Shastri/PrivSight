from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parents[1]))

from input_layout import resolve_dataset


def test_resolves_versioned_kaggle_dataset_mount(tmp_path: Path):
    mounted = tmp_path / "datasets" / "owner" / "privsight-ui-six-class" / "versions" / "3"
    (mounted / "images" / "train").mkdir(parents=True)

    assert resolve_dataset(tmp_path, "privsight-ui-six-class", ("images/train",)) == mounted


def test_prefers_complete_mount_over_incomplete_legacy_directory(tmp_path: Path):
    (tmp_path / "privsight-ui-six-class").mkdir()
    complete = tmp_path / "datasets" / "owner" / "privsight-ui-six-class" / "versions" / "1"
    (complete / "images" / "train").mkdir(parents=True)

    assert resolve_dataset(tmp_path, "privsight-ui-six-class", ("images/train",)) == complete
