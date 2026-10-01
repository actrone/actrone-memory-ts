// Run with `node scripts/check-compat.mjs` (see package.json). No `#!` shebang: this module is
// also imported by the test suite, and a shebang makes Node's ESM loader reject it.
/**
 * check-compat: the framework-compatibility drift gate for actrone-memory.
 *
 * Makes compatibility.json the single source of truth: fails if the optional `peerDependencies` in
 * package.json or the framework compatibility matrix in README.md drift from it.
 *
 * Per framework: the peer package is declared with the manifest `range`, is marked optional in
 * `peerDependenciesMeta`, and has a README matrix row (label + peer + range). Reverse: every optional peer is
 * a framework in the manifest. Exit 0 in sync, else exit 1 with a precise diff. No installs, no network.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

/**
 * Normalise a range for comparison. The README writes versions without trailing zero components
 * (`ai >=5 <6`) while package.json spells them out (`>=5.0.0 <6`); both mean the same range.
 */
export function normaliseRange(range) {
  return String(range)
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\d+(?:\.\d+)*/g, (version) => version.replace(/(?:\.0)+$/, ""));
}

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");

/**
 * Check one framework's README matrix row: it exists (`| <Label> | …`), names this peer at the start
 * of a code span (so it can't reference the wrong package), and states the manifest range. Returns the
 * drift errors for that row.
 */
function readmeRowErrors(name, { peer, range, readme: label }, readmeLines) {
  const row = readmeLines.find((line) => line.startsWith(`| ${label} |`));
  if (!row) return [`[${name}] README compat matrix has no "${label}" row`];
  const span = new RegExp("`" + escapeRegExp(peer) + " ([^`]+)`").exec(row);
  if (!span) return [`[${name}] README compat matrix "${label}" row missing \`${peer} …\``];
  if (normaliseRange(span[1]) !== normaliseRange(range)) {
    return [`[${name}] README compat matrix "${label}" row says \`${peer} ${span[1]}\` != manifest "${range}"`];
  }
  return [];
}

/**
 * Pure core (unit-testable): validate a package.json + README against the manifest. Returns the list
 * of drift errors ([] when in sync).
 */
export function checkAgainst(manifest, pkg, readme) {
  const peers = pkg.peerDependencies ?? {};
  const meta = pkg.peerDependenciesMeta ?? {};
  const frameworks = manifest.frameworks;
  const readmeLines = readme.split(/\r?\n/);
  const errors = [];

  for (const [name, fw] of Object.entries(frameworks)) {
    const { peer, range } = fw;
    if (!(peer in peers)) {
      errors.push(`[${name}] package.json peerDependencies is missing '${peer}'`);
    } else if (peers[peer] !== range) {
      errors.push(`[${name}] peer '${peer}' is "${peers[peer]}" != manifest "${range}"`);
    }
    if (!meta[peer]?.optional) {
      errors.push(`[${name}] peer '${peer}' must be optional in peerDependenciesMeta`);
    }
    errors.push(...readmeRowErrors(name, fw, readmeLines));
  }

  // reverse: every optional peer must be a manifest framework's peer OR a known supporting/infra peer
  // (e.g. @ai-sdk/openai, openai, @temporalio/*: declared in `non_framework_peers`).
  const known = new Set(Object.values(frameworks).map((f) => f.peer));
  const nonFramework = new Set(manifest.non_framework_peers ?? []);
  for (const peer of Object.keys(meta)) {
    if (meta[peer]?.optional && !known.has(peer) && !nonFramework.has(peer)) {
      errors.push(
        `[peer '${peer}'] optional peerDependency not in compatibility.json ` +
          "(add it as a framework, or to non_framework_peers)",
      );
    }
  }
  return errors;
}

/** Load the repo's compatibility.json + package.json + README.md and validate them. */
export function check(root) {
  const manifest = JSON.parse(readFileSync(resolve(root, "compatibility.json"), "utf8"));
  const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
  const readme = readFileSync(resolve(root, "README.md"), "utf8");
  return { errors: checkAgainst(manifest, pkg, readme), count: Object.keys(manifest.frameworks).length };
}

// Run as a CLI (not when imported by a test).
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("check-compat.mjs")) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const { errors, count } = check(root);
  if (errors.length > 0) {
    console.error("[check-compat] DRIFT: package.json/README disagree with compatibility.json:\n");
    for (const e of errors) console.error(`  x ${e}`);
    console.error("\nUpdate compatibility.json (the source of truth) or fix the drift, then re-run.");
    process.exit(1);
  }
  console.log(
    `[check-compat] in sync: ${count} frameworks; peerDependencies + README matrix agree OK`,
  );
}
