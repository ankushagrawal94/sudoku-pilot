import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { validateTrustedImportManifest } from "../scripts/validate-trusted-import-corpus.mjs";

const template = JSON.parse(await readFile(new URL("../resources/trusted-import-evaluation/manifest.template.json", import.meta.url), "utf8"));
const example = JSON.parse(await readFile(new URL("../resources/trusted-import-evaluation/manifest.example.json", import.meta.url), "utf8"));

assert.deepEqual(validateTrustedImportManifest(template, { allowEmpty: true }), [], "collecting template should be valid before evidence arrives");
assert.deepEqual(validateTrustedImportManifest(example, { allowEmpty: true }), [], "documented example should satisfy semantic structure");

const duplicateCandidate = structuredClone(example);
duplicateCandidate.cases[0].ground_truth.candidates[2] = "114";
assert.ok(validateTrustedImportManifest(duplicateCandidate).some((error) => error.includes("unique ascending digits")));

const roleWithoutValue = structuredClone(example);
roleWithoutValue.cases[0].ground_truth.value_roles = `${roleWithoutValue.cases[0].ground_truth.value_roles.slice(0, 2)}U${roleWithoutValue.cases[0].ground_truth.value_roles.slice(3)}`;
assert.ok(validateTrustedImportManifest(roleWithoutValue).some((error) => error.includes("exactly when a visible value exists")));

const unsafePath = structuredClone(example);
unsafePath.cases[0].image.path = "../private.png";
assert.ok(validateTrustedImportManifest(unsafePath).some((error) => error.includes("must stay under")));

const unreviewedTest = structuredClone(example);
unreviewedTest.cases[0].split = "test";
assert.ok(validateTrustedImportManifest(unreviewedTest).some((error) => error.includes("second_review must be true")));

const duplicateCase = structuredClone(example);
duplicateCase.cases.push(structuredClone(duplicateCase.cases[0]));
assert.ok(validateTrustedImportManifest(duplicateCase).some((error) => error.includes("duplicates")));

console.log("trusted import corpus contract tests passed");
