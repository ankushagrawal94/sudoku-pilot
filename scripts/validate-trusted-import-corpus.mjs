import { createHash } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const SPLITS = ["development", "validation", "test"];
const PLATFORMS = ["ios", "android", "web", "desktop"];
const DEVICE_CLASSES = ["phone", "tablet", "desktop"];
const THEMES = ["light", "dark", "other"];
const SCREENSHOT_SCOPES = ["full-screen", "cropped-grid", "cropped-app"];
const CORPUS_IMAGE_PREFIX = "resources/trusted-import-evaluation/images/";

export function validateTrustedImportManifest(manifest, { allowEmpty = false } = {}) {
  const errors = [];
  if (!isObject(manifest)) return ["manifest must be an object"];

  expectEqual(errors, manifest.schema_version, 1, "schema_version");
  expectSlug(errors, manifest.corpus_id, "corpus_id");
  expectOneOf(errors, manifest.status, ["collecting", "frozen"], "status");
  expectDate(errors, manifest.created_at, "created_at");
  validateTargets(manifest.targets, errors);

  if (!Array.isArray(manifest.cases)) {
    errors.push("cases must be an array");
    return errors;
  }
  if (manifest.status === "frozen" && manifest.cases.length === 0) errors.push("a frozen corpus cannot be empty");
  if (!allowEmpty && manifest.status !== "collecting" && manifest.cases.length === 0) errors.push("cases cannot be empty");

  const ids = new Set();
  const imageHashes = new Map();
  for (const [index, entry] of manifest.cases.entries()) {
    const label = `cases[${index}]`;
    validateCase(entry, label, errors);
    if (!isObject(entry)) continue;
    if (ids.has(entry.id)) errors.push(`${label}.id duplicates ${entry.id}`);
    ids.add(entry.id);
    const priorHash = imageHashes.get(entry.image?.sha256);
    if (priorHash) errors.push(`${label}.image.sha256 duplicates ${priorHash}; one screenshot cannot appear twice or cross splits`);
    if (entry.image?.sha256) imageHashes.set(entry.image.sha256, entry.id || label);
  }

  if (manifest.status === "frozen" && isObject(manifest.targets)) validateFrozenCoverage(manifest, errors);
  return errors;
}

export async function verifyTrustedImportFiles(manifest, { cwd = process.cwd(), allowMissingImages = false } = {}) {
  const errors = [];
  if (!Array.isArray(manifest?.cases)) return errors;
  for (const [index, entry] of manifest.cases.entries()) {
    const imagePath = entry?.image?.path;
    if (typeof imagePath !== "string" || !imagePath.startsWith(CORPUS_IMAGE_PREFIX) || imagePath.includes("..")) continue;
    const absolutePath = resolve(cwd, imagePath);
    try {
      await access(absolutePath);
    } catch {
      if (!allowMissingImages) errors.push(`cases[${index}].image.path does not exist: ${imagePath}`);
      continue;
    }
    const digest = createHash("sha256").update(await readFile(absolutePath)).digest("hex");
    if (digest !== entry.image.sha256) errors.push(`cases[${index}].image.sha256 does not match ${imagePath}`);
  }
  return errors;
}

function validateTargets(targets, errors) {
  if (!isObject(targets)) {
    errors.push("targets must be an object");
    return;
  }
  for (const key of ["source_apps", "cases_per_source", "development_per_source", "validation_per_source", "test_per_source"]) {
    if (!Number.isInteger(targets[key]) || targets[key] < 1) errors.push(`targets.${key} must be a positive integer`);
  }
  const splitTotal = targets.development_per_source + targets.validation_per_source + targets.test_per_source;
  if (Number.isFinite(splitTotal) && splitTotal !== targets.cases_per_source) {
    errors.push("targets split counts must sum to targets.cases_per_source");
  }
  expectEqual(errors, targets.candidate_layout, "position-encoded-3x3", "targets.candidate_layout");
  expectEqual(errors, targets.input_kind, "digital-screenshot", "targets.input_kind");
}

function validateCase(entry, label, errors) {
  if (!isObject(entry)) {
    errors.push(`${label} must be an object`);
    return;
  }
  expectSlug(errors, entry.id, `${label}.id`);
  expectOneOf(errors, entry.split, SPLITS, `${label}.split`);
  validateSource(entry.source, `${label}.source`, errors);
  validateConsent(entry.consent, `${label}.consent`, errors);
  validateImage(entry.image, `${label}.image`, errors);
  validateAlignment(entry.alignment, `${label}.alignment`, errors);
  validateGroundTruth(entry.ground_truth, `${label}.ground_truth`, errors);
  validateLabels(entry.labels, `${label}.labels`, errors);
  if (entry.split === "test" && entry.labels?.second_review !== true) errors.push(`${label}.labels.second_review must be true for test cases`);
}

function validateSource(source, label, errors) {
  if (!isObject(source)) {
    errors.push(`${label} must be an object`);
    return;
  }
  expectSlug(errors, source.app_id, `${label}.app_id`);
  expectText(errors, source.app_name, `${label}.app_name`);
  expectText(errors, source.app_version, `${label}.app_version`);
  expectOneOf(errors, source.platform, PLATFORMS, `${label}.platform`);
  expectOneOf(errors, source.device_class, DEVICE_CLASSES, `${label}.device_class`);
  expectOneOf(errors, source.theme, THEMES, `${label}.theme`);
  expectOneOf(errors, source.screenshot_scope, SCREENSHOT_SCOPES, `${label}.screenshot_scope`);
}

function validateConsent(consent, label, errors) {
  if (!isObject(consent)) {
    errors.push(`${label} must be an object`);
    return;
  }
  expectEqual(errors, consent.permission, "first-party-consented", `${label}.permission`);
  expectText(errors, consent.contributor_id, `${label}.contributor_id`);
  expectText(errors, consent.record, `${label}.record`);
}

function validateImage(image, label, errors) {
  if (!isObject(image)) {
    errors.push(`${label} must be an object`);
    return;
  }
  if (typeof image.path !== "string" || !image.path.startsWith(CORPUS_IMAGE_PREFIX) || image.path.includes("..")) {
    errors.push(`${label}.path must stay under ${CORPUS_IMAGE_PREFIX}`);
  }
  if (!/^[a-f0-9]{64}$/.test(image.sha256 || "")) errors.push(`${label}.sha256 must be 64 lowercase hexadecimal characters`);
  for (const dimension of ["width", "height"]) {
    if (!Number.isInteger(image[dimension]) || image[dimension] < 81) errors.push(`${label}.${dimension} must be an integer of at least 81`);
  }
  expectEqual(errors, image.sanitized, true, `${label}.sanitized`);
}

function validateAlignment(alignment, label, errors) {
  if (!isObject(alignment)) {
    errors.push(`${label} must be an object`);
    return;
  }
  expectEqual(errors, alignment.method, "human-confirmed", `${label}.method`);
  if (!Array.isArray(alignment.grid_corners) || alignment.grid_corners.length !== 4) {
    errors.push(`${label}.grid_corners must contain top-left, top-right, bottom-right, and bottom-left`);
    return;
  }
  for (const [index, point] of alignment.grid_corners.entries()) {
    if (!isObject(point) || !isUnitNumber(point.x) || !isUnitNumber(point.y)) {
      errors.push(`${label}.grid_corners[${index}] must have normalized x and y values`);
    }
  }
  if (alignment.grid_corners.every((point) => isObject(point) && isUnitNumber(point.x) && isUnitNumber(point.y))) {
    const [topLeft, topRight, bottomRight, bottomLeft] = alignment.grid_corners;
    const topY = (topLeft.y + topRight.y) / 2;
    const bottomY = (bottomLeft.y + bottomRight.y) / 2;
    const leftX = (topLeft.x + bottomLeft.x) / 2;
    const rightX = (topRight.x + bottomRight.x) / 2;
    if (topY >= bottomY || leftX >= rightX || polygonArea(alignment.grid_corners) < 0.02) {
      errors.push(`${label}.grid_corners must form a non-degenerate grid in documented corner order`);
    }
  }
}

function validateGroundTruth(truth, label, errors) {
  if (!isObject(truth)) {
    errors.push(`${label} must be an object`);
    return;
  }
  if (!/^[0-9]{81}$/.test(truth.values || "")) errors.push(`${label}.values must contain exactly 81 digits using 0 for empty`);
  if (!/^[GPU.]{81}$/.test(truth.value_roles || "")) errors.push(`${label}.value_roles must contain exactly 81 G, P, U, or . characters`);
  if (!Array.isArray(truth.candidates) || truth.candidates.length !== 81) {
    errors.push(`${label}.candidates must contain exactly 81 strings`);
  } else {
    truth.candidates.forEach((digits, index) => {
      if (typeof digits !== "string" || !/^[1-9]*$/.test(digits) || digits !== [...new Set(digits)].sort().join("")) {
        errors.push(`${label}.candidates[${index}] must contain unique ascending digits 1 through 9`);
      }
      if (truth.values?.[index] !== "0" && digits) errors.push(`${label}.candidates[${index}] must be empty when a visible value exists`);
    });
  }
  if (/^[0-9]{81}$/.test(truth.values || "") && /^[GPU.]{81}$/.test(truth.value_roles || "")) {
    for (let index = 0; index < 81; index += 1) {
      const hasValue = truth.values[index] !== "0";
      if (hasValue === (truth.value_roles[index] === ".")) {
        errors.push(`${label}.value_roles[${index}] must be G, P, or U exactly when a visible value exists`);
      }
    }
  }
  if (truth.solution !== undefined) {
    if (!/^[1-9]{81}$/.test(truth.solution)) errors.push(`${label}.solution must contain exactly 81 digits from 1 through 9`);
    if (/^[1-9]{81}$/.test(truth.solution || "") && /^[0-9]{81}$/.test(truth.values || "") && /^[GPU.]{81}$/.test(truth.value_roles || "")) {
      for (let index = 0; index < 81; index += 1) {
        if (truth.value_roles[index] === "G" && truth.values[index] !== truth.solution[index]) {
          errors.push(`${label}.solution conflicts with reviewed given at cell ${index}`);
        }
      }
    }
  }
}

function validateLabels(labels, label, errors) {
  if (!isObject(labels)) {
    errors.push(`${label} must be an object`);
    return;
  }
  expectText(errors, labels.verified_by, `${label}.verified_by`);
  expectDate(errors, labels.verified_at, `${label}.verified_at`);
  if (typeof labels.second_review !== "boolean") errors.push(`${label}.second_review must be a boolean`);
}

function validateFrozenCoverage(manifest, errors) {
  const bySource = new Map();
  for (const entry of manifest.cases) {
    if (!entry?.source?.app_id || !SPLITS.includes(entry.split)) continue;
    if (!bySource.has(entry.source.app_id)) bySource.set(entry.source.app_id, Object.fromEntries(SPLITS.map((split) => [split, 0])));
    bySource.get(entry.source.app_id)[entry.split] += 1;
  }
  if (bySource.size !== manifest.targets.source_apps) {
    errors.push(`frozen corpus must contain exactly ${manifest.targets.source_apps} source apps; found ${bySource.size}`);
  }
  const expected = {
    development: manifest.targets.development_per_source,
    validation: manifest.targets.validation_per_source,
    test: manifest.targets.test_per_source
  };
  for (const [source, counts] of bySource.entries()) {
    for (const split of SPLITS) {
      if (counts[split] !== expected[split]) errors.push(`${source} must contain ${expected[split]} ${split} cases; found ${counts[split]}`);
    }
  }
}

function expectEqual(errors, actual, expected, label) {
  if (actual !== expected) errors.push(`${label} must equal ${JSON.stringify(expected)}`);
}

function expectOneOf(errors, actual, expected, label) {
  if (!expected.includes(actual)) errors.push(`${label} must be one of ${expected.join(", ")}`);
}

function expectSlug(errors, value, label) {
  if (typeof value !== "string" || !/^[a-z0-9][a-z0-9-]*$/.test(value)) errors.push(`${label} must be a lowercase slug`);
}

function expectText(errors, value, label) {
  if (typeof value !== "string" || !value.trim()) errors.push(`${label} must be non-empty text`);
}

function expectDate(errors, value, label) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    errors.push(`${label} must be an ISO date`);
  }
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isUnitNumber(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

function polygonArea(points) {
  let twiceArea = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    twiceArea += current.x * next.y - next.x * current.y;
  }
  return Math.abs(twiceArea) / 2;
}

async function main() {
  const args = process.argv.slice(2);
  const allowMissingImages = args.includes("--allow-missing-images");
  const manifestPath = args.find((argument) => !argument.startsWith("--")) || "resources/trusted-import-evaluation/manifest.template.json";
  const manifest = JSON.parse(await readFile(resolve(process.cwd(), manifestPath), "utf8"));
  const errors = [
    ...validateTrustedImportManifest(manifest, { allowEmpty: manifest.status === "collecting" }),
    ...await verifyTrustedImportFiles(manifest, { allowMissingImages })
  ];
  if (errors.length) {
    console.error(`trusted import corpus verification failed (${errors.length}):`);
    errors.forEach((error) => console.error(`- ${error}`));
    process.exitCode = 1;
    return;
  }
  const sources = new Set(manifest.cases.map((entry) => entry.source.app_id));
  console.log(`trusted import corpus verified: ${manifest.cases.length} cases, ${sources.size} sources, status ${manifest.status}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
