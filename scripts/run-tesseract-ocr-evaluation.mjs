#!/usr/bin/env node
/**
 * Score the pinned browser OCR engine against the repository corpus.
 * This uses the same trained data served by the PWA, but runs cell-by-cell
 * because a Sudoku grid is a two-dimensional document, not a text paragraph.
 */
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createWorker, PSM } from "tesseract.js";

const root = resolve(new URL("..", import.meta.url).pathname);
const corpus = resolve(root, "resources/ocr-evaluation");
const manifest = JSON.parse(await readFile(resolve(corpus, "manifest.json"), "utf8"));
const worker = await createWorker("eng", 1, {
  langPath: resolve(root, "public/ocr"),
  gzip: true,
  logger: () => {}
});
await worker.setParameters({
  tessedit_char_whitelist: "123456789",
  tessedit_pageseg_mode: PSM.SINGLE_CHAR
});

async function recognizeCell(image, left, top, width, height) {
  const { data } = await worker.recognize(image, { rectangle: { left, top, width, height } });
  const digits = String(data.text || "").match(/[1-9]/g) || [];
  return digits.length === 1 ? Number(digits[0]) : 0;
}

const predictions = {};
for (const testCase of manifest.cases) {
  const image = resolve(root, testCase.image_path);
  // Corpus boards are 756px square: outer grid starts at 54px; cells are 72px.
  const grid = [];
  for (let row = 0; row < 9; row += 1) {
    const values = [];
    for (let col = 0; col < 9; col += 1) {
      values.push(await recognizeCell(image, 54 + col * 72, 54 + row * 72, 72, 72));
    }
    grid.push(values);
  }
  predictions[testCase.id] = grid;
  process.stderr.write(`recognized ${testCase.id}\n`);
}
await worker.terminate();
const output = resolve(root, "artifacts/ocr-evaluation/tesseract-5.1.1-cellwise.json");
await writeFile(output, `${JSON.stringify(predictions, null, 2)}\n`);
console.log(output);
