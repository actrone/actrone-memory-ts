#!/usr/bin/env node
/**
 * compat-matrix (emitter), expand @actrone/memory's compatibility.json into a version-matrix job list.
 *
 * The adapters are STRUCTURAL (no runtime framework import), so the drift gate (scripts/check-compat.mjs)
 * can only prove the *declared* peer range is self-consistent. This matrix goes further: for each framework
 * it installs the REAL peer at three boundaries of its declared range and type-checks a canary against it,
 * so a peer that no longer exists / resolves / type-checks at a boundary is caught here, not by a user.
 *
 *   node ci/compat-matrix/matrix.mjs emit
 *
 * Boundaries per framework (derived from the manifest `range`, e.g. ">=5.0.0 <6"):
 *   floor: the exact `>=` version (oldest supported)         → hard gate
 *   current: the whole range (npm resolves the latest in it)   → hard gate
 *   next: `>=<cap>` (the next major we exclude; may not exist yet) → allow_fail (early warning)
 *
 * Each job: { framework, peer, spec, example, which, allow_fail }. `example` is the framework's own
 * examples/frameworks/<name>.ts (already type-checked against our adapter); the runner prepends a peer
 * install-smoke import and type-checks the whole thing against the installed peer version.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Derive the { floor, current, next } install specs for one framework's declared range. Handles the two
 * manifest range styles: an explicit ">=<floor> <<cap>" and npm caret "^<x.y.z>".
 *   floor: the exact oldest supported version
 *   current: the whole declared range (npm resolves the latest satisfying it)
 *   next: ">=<next-major-boundary>" (the version line we exclude; may not exist yet → allow_fail)
 */
export function specsForRange(range) {
  const r = String(range).trim();

  // ">=A <B"  → floor A, cap B
  let m = /^>=\s*([0-9][0-9A-Za-z.-]*)\s+<\s*([0-9][0-9A-Za-z.-]*)$/.exec(r);
  if (m) return { floor: m[1], current: r, next: `>=${m[2]}` };

  // "^A.B.C"  → caret. For A>0: next = A+1. For A=0,B>0: next = 0.(B+1) (caret pins the minor on 0.x).
  m = /^\^\s*(\d+)\.(\d+)\.([0-9A-Za-z.-]+)$/.exec(r);
  if (m) {
    const major = Number(m[1]);
    const minor = Number(m[2]);
    const next = major > 0 ? `${major + 1}` : minor > 0 ? `0.${minor + 1}` : `0.0.${Number(m[3].split(/[.-]/)[0]) + 1}`;
    return { floor: `${m[1]}.${m[2]}.${m[3]}`, current: r, next: `>=${next}` };
  }

  throw new Error(`compat-matrix: unparseable range "${range}" (expected ">=<floor> <<cap>" or "^x.y.z")`);
}

/**
 * Read the repo's compatibility.json and emit the flat job list.
 *
 * Two canary depths, picked per framework:
 *   - a DEDICATED canary at ci/compat-matrix/canaries/<fw>.ts (imports the REAL framework and asserts our
 *     adapter output satisfies its typed call site) → used verbatim (`dedicated: true`).
 *   - otherwise the framework's examples/frameworks/<fw>.ts (adapter-API only) → the runner prepends a
 *     peer install-smoke import (`dedicated: false`): does the peer still install + resolve + type-check.
 */
export function emit(root) {
  const manifest = JSON.parse(readFileSync(resolve(root, "compatibility.json"), "utf8"));
  const jobs = [];
  for (const [name, fw] of Object.entries(manifest.frameworks)) {
    const specs = specsForRange(fw.range);
    const dedicated = existsSync(resolve(root, "ci", "compat-matrix", "canaries", `${name}.ts`));
    const canary = dedicated ? `ci/compat-matrix/canaries/${name}.ts` : `examples/frameworks/${name}.ts`;
    for (const which of ["floor", "current", "next"]) {
      jobs.push({
        framework: name,
        peer: fw.peer,
        spec: specs[which],
        canary,
        dedicated,
        which,
        allow_fail: which === "next",
      });
    }
  }
  return jobs;
}

// ── CLI ──────────────────────────────────────────────────────────────────────
// Only when run directly (not when imported for its exports, e.g. by a unit test).
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("matrix.mjs")) {
  // matrix.mjs lives at <repo>/ci/compat-matrix/; the repo root (compatibility.json) is two up.
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
  if (process.argv[2] === "emit") {
    process.stdout.write(JSON.stringify(emit(repoRoot)) + "\n");
  } else {
    process.stderr.write("usage: matrix.mjs emit\n");
    process.exit(2);
  }
}
