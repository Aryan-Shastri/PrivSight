#!/usr/bin/env python3
"""Deterministic fixture inference for candidate-region masking (not accuracy evaluation)."""
from __future__ import annotations

import argparse
import json
import math
import time
import urllib.request
from pathlib import Path

import cv2
import numpy as np
import onnxruntime as ort
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent
FACE_FIXTURE_URL = "https://raw.githubusercontent.com/Linzaer/Ultra-Light-Fast-Generic-Face-Detector-1MB/dffdddda9794a50607cba8f318507a28c1c27cab/imgs/1.jpg"


def percentile_nearest_rank(values: list[float], percentile: float) -> float:
    ordered = sorted(values)
    return ordered[max(0, math.ceil(percentile / 100 * len(ordered)) - 1)]


def nms(boxes: np.ndarray, scores: np.ndarray, threshold: float) -> list[int]:
    if not len(boxes):
        return []
    areas = np.maximum(0, boxes[:, 2] - boxes[:, 0]) * np.maximum(0, boxes[:, 3] - boxes[:, 1])
    order = scores.argsort(kind="stable")[::-1]
    keep: list[int] = []
    while order.size:
        current = int(order[0]); keep.append(current)
        xx1 = np.maximum(boxes[current, 0], boxes[order[1:], 0])
        yy1 = np.maximum(boxes[current, 1], boxes[order[1:], 1])
        xx2 = np.minimum(boxes[current, 2], boxes[order[1:], 2])
        yy2 = np.minimum(boxes[current, 3], boxes[order[1:], 3])
        intersection = np.maximum(0, xx2 - xx1) * np.maximum(0, yy2 - yy1)
        union = areas[current] + areas[order[1:]] - intersection
        order = order[1:][np.divide(intersection, union, out=np.zeros_like(intersection), where=union > 0) <= threshold]
    return keep


def session(path: Path) -> ort.InferenceSession:
    options = ort.SessionOptions()
    options.intra_op_num_threads = 1
    options.inter_op_num_threads = 1
    options.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL
    options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
    return ort.InferenceSession(path, sess_options=options, providers=["CPUExecutionProvider"])


def timed_run(sess: ort.InferenceSession, tensor: np.ndarray, iterations: int) -> tuple[list[np.ndarray], dict]:
    feed = {sess.get_inputs()[0].name: tensor}
    for _ in range(3): sess.run(None, feed)
    durations, outputs = [], []
    for _ in range(iterations):
        started = time.perf_counter_ns(); outputs = sess.run(None, feed)
        durations.append((time.perf_counter_ns() - started) / 1_000_000)
    return outputs, {"iterations": iterations, "median_ms": percentile_nearest_rank(durations, 50), "p95_ms": percentile_nearest_rank(durations, 95)}


def ensure_fixtures() -> tuple[Path, Path]:
    fixture_dir = ROOT / ".cache" / "fixtures"; fixture_dir.mkdir(parents=True, exist_ok=True)
    face = fixture_dir / "ultraface-upstream-imgs-1.jpg"
    if not face.exists(): urllib.request.urlretrieve(FACE_FIXTURE_URL, face)
    text = fixture_dir / "synthetic-text.png"
    image = Image.new("RGB", (736, 736), "white")
    draw = ImageDraw.Draw(image); font = ImageFont.truetype("DejaVuSans.ttf", 52)
    draw.text((42, 100), "PRIVATE ACCOUNT 1234", fill="black", font=font)
    draw.text((42, 240), "email@example.test", fill="black", font=font)
    draw.text((42, 380), "+1 555 010 2020", fill="black", font=font)
    image.save(text, optimize=False, compress_level=9)
    return face, text


def face_eval(model: Path, fixture: Path, iterations: int) -> dict:
    original = cv2.imread(str(fixture)); height, width = original.shape[:2]
    rgb = cv2.cvtColor(cv2.resize(original, (320, 240)), cv2.COLOR_BGR2RGB)
    tensor = ((rgb.astype(np.float32) - 127.0) / 128.0).transpose(2, 0, 1)[None]
    outputs, latency = timed_run(session(model), tensor, iterations)
    scores, boxes = outputs; confidence = scores[0, :, 1]; selected = confidence > 0.7
    pixels = boxes[0, selected] * np.array([width, height, width, height], np.float32)
    pixels[:, [0, 2]] = np.clip(pixels[:, [0, 2]], 0, width); pixels[:, [1, 3]] = np.clip(pixels[:, [1, 3]], 0, height)
    kept = nms(pixels, confidence[selected], 0.3)
    mask = np.zeros((height, width), np.uint8)
    for box in pixels[kept].astype(int): cv2.rectangle(mask, tuple(box[:2]), tuple(box[2:]), 255, -1)
    return {"fixture": str(fixture.resolve()), "threshold": 0.7, "nms_iou": 0.3, "regions": len(kept), "masked_fraction": float(np.count_nonzero(mask) / mask.size), "latency": latency}


def text_eval(model: Path, fixture: Path, iterations: int) -> dict:
    bgr = cv2.imread(str(fixture)); rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB).astype(np.float32)
    tensor = (((rgb / 255.0) - np.array([0.485, 0.456, 0.406], np.float32)) / np.array([0.229, 0.224, 0.225], np.float32)).transpose(2, 0, 1)[None]
    outputs, latency = timed_run(session(model), tensor.astype(np.float32), iterations)
    heatmap = np.squeeze(outputs[0]); binary = (heatmap >= 0.3).astype(np.uint8)
    binary = cv2.dilate(binary, np.ones((7, 7), np.uint8), iterations=1)
    count, labels, stats, _ = cv2.connectedComponentsWithStats(binary, 8)
    regions = [s.tolist() for s in stats[1:] if s[4] >= 16]
    mask = np.isin(labels, [i + 1 for i, s in enumerate(stats[1:]) if s[4] >= 16])
    return {"fixture": str(fixture.resolve()), "binary_threshold": 0.3, "postprocess": "7x7 dilation + 8-connected components, area >=16", "regions": len(regions), "masked_fraction": float(mask.mean()), "latency": latency}


def main() -> None:
    parser = argparse.ArgumentParser(); parser.add_argument("--iterations", type=int, default=20); args = parser.parse_args()
    if args.iterations < 1: parser.error("--iterations must be positive")
    face_fixture, text_fixture = ensure_fixtures()
    result = {
        "runtime": {"onnxruntime": ort.__version__, "provider": "CPUExecutionProvider", "threads": 1, "warmup_iterations": 3},
        "face": face_eval(ROOT / ".cache/models/version-RFB-320.onnx", face_fixture, args.iterations),
        "ocr": text_eval(ROOT / ".cache/models/text_detection_en_ppocrv3_2023may.onnx", text_fixture, args.iterations),
    }
    output = ROOT / "output" / "fixture-results.json"; output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, indent=2, sort_keys=True) + "\n"); print(json.dumps(result, indent=2, sort_keys=True))


if __name__ == "__main__": main()
