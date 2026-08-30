import fs from "node:fs";
import path from "node:path";

// Verifies that every vendored copy under supabase/functions/_shared/core/
// still matches its packages/core/src/ source, once the known mechanical
// rewrites are applied — the automated version of the one-off `diff` this
// vendoring pattern has relied on by hand since it started. No CI runs
// this; it's part of CLAUDE.md's "before any change is done" list.
//
// Deliberately hard-codes the file list rather than globbing a directory
// — a new vendored file has to be added here explicitly, the same way a
// new rewrite has to be added to REWRITE_RULES explicitly. Either kind of
// silent gap is exactly what this script exists to catch, including in
// itself.
//
// Usage: npm run check:vendor (no arguments)

const ROOT = path.resolve(import.meta.dirname, "..");
const SOURCE_DIR = path.join(ROOT, "packages", "core", "src");
const VENDORED_DIR = path.join(ROOT, "supabase", "functions", "_shared", "core");

// The complete, known set of vendored files — matches
// supabase/functions/_shared/core/README.md's own list exactly.
const VENDORED_FILES = [
  "dateTz.ts",
  "stats.ts",
  "personality.ts",
  "digest.ts",
  "generateDigest.ts",
  "progression.ts",
  "trends.ts",
  "logging.ts",
  "nextSession.ts",
  "rules.ts",
  "food.ts",
  "dashboard.ts",
];

// Rewrite 1 (all files): relative internal imports written for Node/tsx's
// `.js`-pointing-at-`.ts` convention become Deno-resolvable `.ts`. A
// no-op on files with no internal imports.
function rewriteImportExtensions(source: string): string {
  return source.replace(/from "(\.\/[a-zA-Z0-9_]+)\.js"/g, 'from "$1.ts"');
}

// Rewrites 2-3 (generateDigest.ts only): the Deno-required npm: specifier
// for the Anthropic SDK, and process.env.X -> Deno.env.get("X"). The
// vendored copy deliberately keeps source's plain double-read shape
// (not hoisted into a local variable) specifically so this stays a
// literal token substitution — see the vendored file's own header.
function rewriteGenerateDigestOnly(source: string): string {
  let result = source.replace('from "@anthropic-ai/sdk"', 'from "npm:@anthropic-ai/sdk@0.110.0"');
  result = result.replaceAll("process.env.ANTHROPIC_API_KEY", 'Deno.env.get("ANTHROPIC_API_KEY")');
  return result;
}

// Every vendored file is prepended with a "// VENDORED from ..." header —
// an addition, not a rewrite of existing content, so it's stripped from
// the vendored side rather than modeled as a rewrite applied to source.
// Can't bound the header by "contiguous // lines": logging.ts's own
// source-level doc comment sits directly beneath the header with no true
// blank line between them (confirmed against all 12 files, not assumed).
// What's actually invariant, because it's the fixed closing phrase of the
// template every header was written from, is that the header's LAST line
// contains the literal substring "packages/core directly." — search for
// the last occurrence of that phrase within the leading comment block,
// not the first "//" line, and not a "README.md" mention (which in
// wrapped headers isn't the final line either). One blank separator line
// after it — either "" or an empty "//" — is then skipped, if present.
function stripVendoredHeader(vendored: string, filename: string): string {
  const lines = vendored.split("\n");
  if (!lines[0]?.startsWith("// VENDORED from packages/core/src/")) {
    throw new Error(`${filename}: expected line 1 to start with "// VENDORED from packages/core/src/" — has the header been removed or reworded?`);
  }
  let headerEnd = -1;
  for (let i = 0; lines[i]?.startsWith("//"); i++) {
    if (lines[i].includes("packages/core directly.")) headerEnd = i;
  }
  if (headerEnd === -1) {
    throw new Error(`${filename}: no line in the leading comment block contains "packages/core directly." — has the header been removed or reworded?`);
  }
  let bodyStart = headerEnd + 1;
  if (lines[bodyStart] === "" || lines[bodyStart] === "//") bodyStart += 1;
  return lines.slice(bodyStart).join("\n");
}

function diff(expected: string, actual: string, filename: string): string {
  const expectedLines = expected.split("\n");
  const actualLines = actual.split("\n");
  const maxLines = Math.max(expectedLines.length, actualLines.length);
  const mismatches: string[] = [];
  for (let i = 0; i < maxLines; i++) {
    if (expectedLines[i] !== actualLines[i]) {
      mismatches.push(`  line ${i + 1}:`);
      mismatches.push(`    expected: ${expectedLines[i] ?? "(end of file)"}`);
      mismatches.push(`    actual:   ${actualLines[i] ?? "(end of file)"}`);
    }
  }
  return `${filename}: content diverges beyond the known rewrites\n${mismatches.join("\n")}`;
}

function main() {
  const failures: string[] = [];

  // File-set completeness: the directory must contain exactly the known
  // list, nothing extra (an un-enumerated vendored file) and nothing
  // missing.
  const actualFiles = fs
    .readdirSync(VENDORED_DIR)
    .filter((f) => f.endsWith(".ts"))
    .sort();
  const knownFiles = [...VENDORED_FILES].sort();
  const unexpected = actualFiles.filter((f) => !knownFiles.includes(f));
  const missing = knownFiles.filter((f) => !actualFiles.includes(f));
  if (unexpected.length > 0) {
    failures.push(`Unexpected vendored file(s) not in VENDORED_FILES: ${unexpected.join(", ")} — add them to scripts/check-vendor-drift.ts explicitly.`);
  }
  if (missing.length > 0) {
    failures.push(`Known vendored file(s) missing from disk: ${missing.join(", ")}`);
  }

  for (const filename of VENDORED_FILES) {
    const sourcePath = path.join(SOURCE_DIR, filename);
    const vendoredPath = path.join(VENDORED_DIR, filename);

    if (!fs.existsSync(sourcePath)) {
      failures.push(`${filename}: source file missing at packages/core/src/${filename}`);
      continue;
    }
    if (!fs.existsSync(vendoredPath)) {
      continue; // already reported above as missing
    }

    const source = fs.readFileSync(sourcePath, "utf-8");
    const vendored = fs.readFileSync(vendoredPath, "utf-8");

    let expected = rewriteImportExtensions(source);
    if (filename === "generateDigest.ts") {
      expected = rewriteGenerateDigestOnly(expected);
    }

    let actualBody: string;
    try {
      actualBody = stripVendoredHeader(vendored, filename);
    } catch (err) {
      failures.push((err as Error).message);
      continue;
    }

    if (expected !== actualBody) {
      failures.push(diff(expected, actualBody, filename));
    }
  }

  if (failures.length > 0) {
    console.error(`check:vendor FAILED — ${failures.length} issue(s):\n`);
    for (const f of failures) console.error(f + "\n");
    process.exit(1);
  }

  console.log(`check:vendor: all ${VENDORED_FILES.length} vendored files match their source exactly, modulo the known rewrites.`);
}

main();
