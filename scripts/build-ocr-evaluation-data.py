#!/usr/bin/env python3
"""Build a deterministic, offline Sudoku OCR evaluation corpus.

Inputs are downloaded only from the URLs recorded in SOURCE.md. Generated boards
contain known givens only; 0 in `expected_grid` means an intentionally empty cell.
"""
from __future__ import annotations

import argparse
import csv
import gzip
import hashlib
import io
import json
import random
import shutil
import urllib.request
import zipfile
from collections import defaultdict
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "resources" / "ocr-evaluation"
SOURCES = DATA / "sources"
PRINTED = DATA / "printed"
HANDWRITTEN = DATA / "handwritten"
FONT_URL = "https://raw.githubusercontent.com/google/fonts/main/ofl/librefranklin/LibreFranklin%5Bwght%5D.ttf"
FONT_LICENSE_URL = "https://raw.githubusercontent.com/google/fonts/main/ofl/librefranklin/OFL.txt"
OPTDIGITS_URL = "https://archive.ics.uci.edu/static/public/80/optical+recognition+of+handwritten+digits.zip"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def fetch(url: str, destination: Path) -> None:
    if destination.exists():
        return
    with urllib.request.urlopen(url, timeout=60) as response, destination.open("wb") as out:
        shutil.copyfileobj(response, out)


def solved_grid(index: int) -> list[list[int]]:
    """A valid grid made by legal digit/row/column permutations of a base grid."""
    rng = random.Random(51_000 + index)
    bands = [0, 1, 2]
    stacks = [0, 1, 2]
    rng.shuffle(bands)
    rng.shuffle(stacks)
    rows = [band * 3 + within for band in bands for within in rng.sample([0, 1, 2], 3)]
    cols = [stack * 3 + within for stack in stacks for within in rng.sample([0, 1, 2], 3)]
    digits = list(range(1, 10))
    rng.shuffle(digits)
    return [[digits[(rows[r] * 3 + rows[r] // 3 + cols[c]) % 9] for c in range(9)] for r in range(9)]


def givens(grid: list[list[int]], index: int) -> list[list[int]]:
    rng = random.Random(62_000 + index)
    positions = list(range(81))
    rng.shuffle(positions)
    keep = set(positions[: 28 + index % 10])
    return [[grid[r][c] if r * 9 + c in keep else 0 for c in range(9)] for r in range(9)]


def board_canvas() -> Image.Image:
    return Image.new("L", (756, 756), 255)


def draw_grid(draw: ImageDraw.ImageDraw) -> None:
    margin, size = 54, 648
    for i in range(10):
        width = 6 if i % 3 == 0 else 2
        p = margin + i * size // 9
        draw.line((margin, p, margin + size, p), fill=12, width=width)
        draw.line((p, margin, p, margin + size), fill=12, width=width)


def render_printed(grid: list[list[int]], output: Path, font: Path) -> None:
    image = board_canvas()
    draw = ImageDraw.Draw(image)
    draw_grid(draw)
    typeface = ImageFont.truetype(str(font), 54)
    margin, cell = 54, 72
    for r in range(9):
        for c in range(9):
            value = grid[r][c]
            if value:
                box = draw.textbbox((0, 0), str(value), font=typeface)
                x = margin + c * cell + (cell - (box[2] - box[0])) // 2
                y = margin + r * cell + (cell - (box[3] - box[1])) // 2 - box[1]
                draw.text((x, y), str(value), font=typeface, fill=20)
    image.save(output, "PNG", optimize=True)


def optdigits_by_value(archive: Path) -> dict[int, list[Image.Image]]:
    examples: dict[int, list[Image.Image]] = defaultdict(list)
    with zipfile.ZipFile(archive) as zf:
        names = [n for n in zf.namelist() if n.endswith(("optdigits.tra", "optdigits.tes"))]
        for name in names:
            for line in zf.read(name).decode("ascii").splitlines():
                values = [int(value) for value in line.split(",")]
                pixels, label = values[:64], values[64]
                image = Image.new("L", (8, 8))
                image.putdata([255 - value * 16 for value in pixels])
                examples[label].append(image)
    return examples


def render_handwritten(grid: list[list[int]], output: Path, examples: dict[int, list[Image.Image]], index: int) -> None:
    image = board_canvas()
    draw = ImageDraw.Draw(image)
    draw_grid(draw)
    margin, cell = 54, 72
    rng = random.Random(73_000 + index)
    counters: dict[int, int] = defaultdict(int)
    for r in range(9):
        for c in range(9):
            value = grid[r][c]
            if not value:
                continue
            source_index = (index * 97 + r * 13 + c * 7 + counters[value]) % len(examples[value])
            counters[value] += 1
            digit = examples[value][source_index].resize((54, 54), Image.Resampling.NEAREST)
            # UCI digit foreground becomes black. Keep a deliberate handwritten offset.
            dx, dy = rng.randint(-4, 4), rng.randint(-4, 4)
            image.paste(digit, (margin + c * cell + 9 + dx, margin + r * cell + 9 + dy))
    image.save(output, "PNG", optimize=True)


def record(case_id: str, kind: str, path: Path, grid: list[list[int]], provenance: str) -> dict[str, object]:
    return {"id": case_id, "kind": kind, "image_path": str(path.relative_to(ROOT)), "sha256": sha256(path),
            "expected_grid": grid, "cell_labels": "givens-only; 0=empty; values=1..9; no pencil notes",
            "provenance": provenance}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--verify-only", action="store_true")
    args = parser.parse_args()
    for directory in (SOURCES, PRINTED, HANDWRITTEN): directory.mkdir(parents=True, exist_ok=True)
    font = SOURCES / "LibreFranklin[wght].ttf"
    font_license = DATA / "licenses" / "OFL-1.1-Libre-Franklin.txt"
    archive = SOURCES / "optdigits.zip"
    font_license.parent.mkdir(exist_ok=True)
    fetch(FONT_URL, font); fetch(FONT_LICENSE_URL, font_license); fetch(OPTDIGITS_URL, archive)
    if args.verify_only:
        manifest = json.loads((DATA / "manifest.json").read_text())
        failures = [x["id"] for x in manifest["cases"] if not (ROOT / x["image_path"]).is_file() or sha256(ROOT / x["image_path"]) != x["sha256"]]
        print(json.dumps({"cases": len(manifest["cases"]), "failures": failures}, indent=2))
        raise SystemExit(bool(failures))
    examples = optdigits_by_value(archive)
    if any(not examples[digit] for digit in range(1, 10)): raise RuntimeError("missing non-zero digit labels")
    cases = []
    for index in range(24):
        grid = givens(solved_grid(index), index)
        printed = PRINTED / f"printed-{index + 1:03}.png"
        handwritten = HANDWRITTEN / f"handwritten-{index + 1:03}.png"
        render_printed(grid, printed, font)
        render_handwritten(grid, handwritten, examples, index)
        cases.append(record(f"printed-{index + 1:03}", "printed", printed, grid,
                            "Locally rendered print-like Sudoku using Libre Franklin (SIL OFL 1.1)."))
        cases.append(record(f"handwritten-{index + 1:03}", "handwritten", handwritten, grid,
                            "Locally composed Sudoku using labeled UCI Optical Recognition of Handwritten Digits samples (CC BY 4.0)."))
    manifest = {"schema_version": 1, "description": "48 deterministic full-board Sudoku OCR cases", "cases": cases,
                "source_sha256": {str(font.relative_to(ROOT)): sha256(font), str(archive.relative_to(ROOT)): sha256(archive),
                                  str(font_license.relative_to(ROOT)): sha256(font_license)}}
    (DATA / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(json.dumps({"cases": len(cases), "printed": 24, "handwritten": 24,
                      "manifest_sha256": sha256(DATA / "manifest.json")}, indent=2))

if __name__ == "__main__": main()
