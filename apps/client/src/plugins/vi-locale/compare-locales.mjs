#!/usr/bin/env node
/**
 * Compare en-US and vi-VN i18next catalogs.
 *
 * Reports keys missing from vi-VN, keys that exist only in vi-VN, and
 * strings whose {{placeholders}} or markup tags do not match.
 *
 * Usage (from the repo root):
 *   node apps/client/src/plugins/vi-locale/compare-locales.mjs
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const localesDir = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../public/locales",
);

const placeholderRe = /\{\{\s*[\w.]+\s*\}\}/g;
const tagRe = /<\/?[A-Za-z][^>]*>/g;

function load(locale) {
  const path = resolve(localesDir, locale, "translation.json");
  return JSON.parse(readFileSync(path, "utf8"));
}

function tokens(pattern, value) {
  if (typeof value !== "string") return [];
  return value.match(pattern) ?? [];
}

function sameList(a, b) {
  if (a.length !== b.length) return false;
  return a.every((item, index) => item === b[index]);
}

const en = load("en-US");
const vi = load("vi-VN");
const enKeys = Object.keys(en);
const viKeys = new Set(Object.keys(vi));

const missing = enKeys.filter((key) => !viKeys.has(key));
const extra = Object.keys(vi).filter((key) => !Object.hasOwn(en, key));
const mismatched = [];

for (const key of enKeys) {
  if (!viKeys.has(key)) continue;
  const enPlaceholders = tokens(placeholderRe, en[key]);
  const viPlaceholders = tokens(placeholderRe, vi[key]);
  const enTags = tokens(tagRe, en[key]);
  const viTags = tokens(tagRe, vi[key]);
  if (!sameList(enPlaceholders, viPlaceholders) || !sameList(enTags, viTags)) {
    mismatched.push({
      key,
      enPlaceholders,
      viPlaceholders,
      enTags,
      viTags,
    });
  }
}

const problems = missing.length + extra.length + mismatched.length;

console.log(`en-US keys: ${enKeys.length}`);
console.log(`vi-VN keys: ${Object.keys(vi).length}`);
console.log(`missing in vi-VN: ${missing.length}`);
console.log(`extra in vi-VN: ${extra.length}`);
console.log(`placeholder or tag mismatches: ${mismatched.length}`);

for (const key of missing) console.log(`  missing: ${key}`);
for (const key of extra) console.log(`  extra: ${key}`);
for (const item of mismatched) {
  console.log(`  mismatch: ${item.key}`);
  console.log(`    en placeholders: ${item.enPlaceholders.join(", ") || "(none)"}`);
  console.log(`    vi placeholders: ${item.viPlaceholders.join(", ") || "(none)"}`);
  console.log(`    en tags: ${item.enTags.join(", ") || "(none)"}`);
  console.log(`    vi tags: ${item.viTags.join(", ") || "(none)"}`);
}

if (problems > 0) {
  process.exitCode = 1;
}
