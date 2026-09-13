from __future__ import annotations

from pathlib import Path
from typing import Iterable


def resolve_dataset(input_root: Path, slug: str, required: Iterable[str]) -> Path:
    """Resolve legacy or versioned Kaggle dataset mounts by content."""
    required = tuple(required)
    candidates = [input_root / slug]
    candidates.extend(
        path
        for path in input_root.rglob(slug)
        if path.is_dir() and path not in candidates
    )
    candidates.extend(
        version
        for slug_dir in input_root.rglob(slug)
        for version in (slug_dir / "versions").glob("*")
        if version.is_dir() and version not in candidates
    )
    candidates.extend(
        path.parent
        for path in input_root.rglob("dataset-metadata.json")
        if path.parent not in candidates
    )
    for candidate in candidates:
        if all((candidate / relative).exists() for relative in required):
            return candidate
    searched = ", ".join(str(path) for path in candidates)
    raise RuntimeError(
        f"unable to resolve Kaggle dataset {slug}; required={required}; candidates=[{searched}]"
    )
