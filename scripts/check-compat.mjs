// Run with `node scripts/check-compat.mjs` (see package.json). No `#!` shebang: this module is
// also imported by the test suite, and a shebang makes Node's ESM loader reject it.
/**
 * check-compat: the framework-compatibility drift gate for @actrone/memory.
 *
 * Makes compatibility.json the single source of truth: fails if the optional `peerDependencies` in
 * package.json or the framework compatibility matrix in README.md drift from it.
 *
 * Per framework: the peer package is declared with the manifest `range`, is marked optional in
 * `peerDependenciesMeta`, and has a README matrix row (label + peer). Reverse: every optional peer is
 * a framework in the manifest. Exit 0 in sync, else exit 1 with a precise diff. No installs, no network.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

/**
 * Pure core (unit-testable): validate a package.json + README against the manifest. Returns the list
 * of drift errors ([] when in sync).
 */
export function checkAgainst(manifest, pkg, readme) {
  const peers = pkg.peerDependencies ?? {};
  const meta = pkg.peerDependenciesMeta ?? {};
  const frameworks = manifest.frameworks;
  const errors = [];

  for (const [name, fw] of Object.entries(frameworks)) {
    const { peer, range, readme: label } = fw;
    if (!(peer in peers)) {
      errors.push(`[${name}] package.json peerDependencies is missing '${peer}'`);
    } else if (peers[peer] !== range) {
      errors.push(`[${name}] peer '${peer}' is "${peers[peer]}" != manifest "${range}"`);
    }
    if (!meta[peer]?.optional) {
      errors.push(`[${name}] peer '${peer}' must be optional in peerDependenciesMeta`);
    }
    // README rows read `<Label> | <adapter> | `<peer> <range>` …`, assert the label row exists and
    // carries this peer at the start of a code span (`` `<peer> ``), so it can't reference the wrong
    // package (works for both `>=x <y` and `^x` range styles).
    if (!readme.includes(label)) {
      errors.push(`[${name}] README compat matrix has no "${label}" row`);
    }
    if (!readme.includes("`" + peer)) {
      errors.push(`[${name}] README compat matrix "${label}" row missing \`${peer} …\``);
    }
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
