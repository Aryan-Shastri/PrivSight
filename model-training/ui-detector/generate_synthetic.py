#!/usr/bin/env python3
"""Generate a deterministic, wholly synthetic six-class YOLO dataset."""
from __future__ import annotations

import argparse
import hashlib
import json
import random
import shutil
import struct
import zlib
from pathlib import Path

CLASSES = ["button", "checkbox", "text_input", "dropdown", "icon", "text_region"]
WIDTH, HEIGHT = 640, 640


def png_bytes(pixels: bytearray) -> bytes:
    def chunk(kind: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)
    rows = b"".join(b"\0" + bytes(pixels[y * WIDTH * 3:(y + 1) * WIDTH * 3]) for y in range(HEIGHT))
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", WIDTH, HEIGHT, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(rows, 9)) + chunk(b"IEND", b"")


def draw_rect(pixels: bytearray, box: tuple[int, int, int, int], color: tuple[int, int, int]) -> None:
    x1, y1, x2, y2 = box
    for y in range(y1, y2):
        start = (y * WIDTH + x1) * 3
        pixels[start:start + (x2 - x1) * 3] = bytes(color) * (x2 - x1)


def make_example(seed: int) -> tuple[bytes, str]:
    rng = random.Random(seed)
    background = (rng.randrange(225, 246), rng.randrange(225, 246), rng.randrange(225, 246))
    pixels = bytearray(background * (WIDTH * HEIGHT))
    specs = [
        (40, 45, 190, 100), (225, 55, 255, 85), (40, 145, 330, 200),
        (365, 145, 570, 200), (50, 250, 105, 305), (150, 245, 555, 340),
    ]
    colors = [(35, 105, 205), (250, 250, 250), (255, 255, 255), (255, 255, 255), (220, 80, 70), (90, 90, 90)]
    labels = []
    for class_id, (base, color) in enumerate(zip(specs, colors)):
        x1, y1, x2, y2 = base
        dx, dy = rng.randint(-12, 12), rng.randint(-10, 10)
        box = (x1 + dx, y1 + dy, x2 + dx, y2 + dy)
        draw_rect(pixels, box, color)
        bx1, by1, bx2, by2 = box
        width, height = bx2 - bx1, by2 - by1
        labels.append(f"{class_id} {(bx1 + bx2) / (2 * WIDTH):.6f} {(by1 + by2) / (2 * HEIGHT):.6f} {width / WIDTH:.6f} {height / HEIGHT:.6f}")
    return png_bytes(pixels), "\n".join(labels) + "\n"


def generate(output: Path, train_sessions: int, val_sessions: int, images_per_session: int, seed: int) -> None:
    if min(train_sessions, val_sessions, images_per_session) < 1:
        raise ValueError("session and image counts must be positive")
    if output.exists() and any(output.iterdir()):
        raise ValueError(f"output must be empty: {output}")
    splits = {
        "train": [f"train-site-{i:03d}/session-{i:03d}" for i in range(train_sessions)],
        "val": [f"val-site-{i:03d}/session-{i:03d}" for i in range(val_sessions)],
    }
    records = []
    for split, sessions in splits.items():
        (output / "images" / split).mkdir(parents=True, exist_ok=True)
        (output / "labels" / split).mkdir(parents=True, exist_ok=True)
        for session_index, session in enumerate(sessions):
            for image_index in range(images_per_session):
                name = f"{split}-s{session_index:03d}-f{image_index:03d}"
                derived_seed = seed * 1_000_003 + (0 if split == "train" else 500_000) + session_index * 1000 + image_index
                image, label = make_example(derived_seed)
                (output / "images" / split / f"{name}.png").write_bytes(image)
                (output / "labels" / split / f"{name}.txt").write_text(label)
                records.append({"file": name, "split": split, "site_session": session})
    (output / "annotations").mkdir()
    for split in splits:
        coco_images, coco_annotations = [], []
        coco_dir = output / f"{split}2017"
        coco_dir.mkdir()
        for image_id, image_path in enumerate(sorted((output / "images" / split).glob("*.png")), 1):
            shutil.copyfile(image_path, coco_dir / image_path.name)
            coco_images.append({"id": image_id, "file_name": image_path.name, "width": WIDTH, "height": HEIGHT})
            label_path = output / "labels" / split / f"{image_path.stem}.txt"
            for object_index, line in enumerate(label_path.read_text().splitlines()):
                class_id, cx, cy, width, height = map(float, line.split())
                box_width, box_height = width * WIDTH, height * HEIGHT
                x, y = cx * WIDTH - box_width / 2, cy * HEIGHT - box_height / 2
                coco_annotations.append({"id": (image_id - 1) * len(CLASSES) + object_index + 1, "image_id": image_id, "category_id": int(class_id) + 1, "bbox": [x, y, box_width, box_height], "area": box_width * box_height, "iscrowd": 0})
        coco = {"images": coco_images, "annotations": coco_annotations, "categories": [{"id": index + 1, "name": name} for index, name in enumerate(CLASSES)]}
        (output / "annotations" / f"instances_{split}.json").write_text(json.dumps(coco, sort_keys=True) + "\n")
    provenance = {
        "schema_version": 1, "generator": "generate_synthetic.py", "seed": seed,
        "license": "CC0-1.0", "provenance": "Programmatically rendered; no third-party screenshots, fonts, images, or personal data.",
        "classes": CLASSES, "image_size": [WIDTH, HEIGHT],
        "splits": {name: {"sessions": sessions, "images": len(sessions) * images_per_session} for name, sessions in splits.items()},
        "records": records,
    }
    (output / "provenance.json").write_text(json.dumps(provenance, indent=2, sort_keys=True) + "\n")
    (output / "LICENSE.txt").write_text("CC0 1.0 Universal: https://creativecommons.org/publicdomain/zero/1.0/\n")
    checksums = {}
    for path in sorted(p for p in output.rglob("*") if p.is_file() and p.name != "checksums.json"):
        checksums[path.relative_to(output).as_posix()] = hashlib.sha256(path.read_bytes()).hexdigest()
    (output / "checksums.json").write_text(json.dumps(checksums, indent=2, sort_keys=True) + "\n")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--train-sessions", type=int, default=32)
    parser.add_argument("--val-sessions", type=int, default=8)
    parser.add_argument("--images-per-session", type=int, default=8)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()
    generate(args.output, args.train_sessions, args.val_sessions, args.images_per_session, args.seed)


if __name__ == "__main__":
    main()
