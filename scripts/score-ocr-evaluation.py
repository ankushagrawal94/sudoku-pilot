#!/usr/bin/env python3
"""Score Sudoku OCR predictions against resources/ocr-evaluation/manifest.json.

Prediction JSON format: {"case-id": [[0, ...], ...]} or a list of
{"id": "case-id", "grid": [[0, ...], ...]}. Values must be 0..9.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "resources" / "ocr-evaluation" / "manifest.json"


def load_predictions(path: Path) -> dict[str, list[list[int]]]:
    raw = json.loads(path.read_text())
    if isinstance(raw, list):
        return {item["id"]: item["grid"] for item in raw}
    if isinstance(raw, dict):
        return raw
    raise ValueError("prediction file must be an object or a list of {id, grid}")


def validate(grid: object, case_id: str) -> list[list[int]]:
    if not isinstance(grid, list) or len(grid) != 9 or any(not isinstance(row, list) or len(row) != 9 for row in grid):
        raise ValueError(f"{case_id}: grid must be 9x9")
    if any(not isinstance(value, int) or not 0 <= value <= 9 for row in grid for value in row):
        raise ValueError(f"{case_id}: values must be integer 0..9")
    return grid  # type: ignore[return-value]


def score(expected: list[list[int]], actual: list[list[int]]) -> dict[str, int]:
    all_cells = [(r, c) for r in range(9) for c in range(9)]
    givens = [(r, c) for r, c in all_cells if expected[r][c] != 0]
    return {"all_correct": sum(expected[r][c] == actual[r][c] for r, c in all_cells), "all_total": 81,
            "givens_correct": sum(expected[r][c] == actual[r][c] for r, c in givens), "givens_total": len(givens)}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("predictions", type=Path)
    args = parser.parse_args()
    cases = json.loads(MANIFEST.read_text())["cases"]
    predictions = load_predictions(args.predictions)
    results = []
    for case in cases:
        case_id = case["id"]
        if case_id not in predictions:
            raise ValueError(f"missing prediction for {case_id}")
        results.append({"id": case_id, "kind": case["kind"], **score(case["expected_grid"], validate(predictions[case_id], case_id))})
    totals = {key: sum(result[key] for result in results) for key in ("all_correct", "all_total", "givens_correct", "givens_total")}
    summary: dict[str, int | float] = dict(totals)
    summary["all_accuracy"] = totals["all_correct"] / totals["all_total"]
    summary["givens_accuracy"] = totals["givens_correct"] / totals["givens_total"]
    print(json.dumps({"summary": summary, "cases": results}, indent=2))

if __name__ == "__main__": main()
