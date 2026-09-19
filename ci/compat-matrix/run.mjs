#!/usr/bin/env node
/**
 * compat-matrix (runner), verify ONE framework at ONE version boundary, in isolation.
 *
 * In a fresh temp project it installs the BUILT @actrone/memory (from the repo root) + the framework
 * peer at the pinned spec + a TypeScript toolchain, then type-checks a canary against the REAL peer.
 * The canary is the framework's own examples/frameworks/<name>.ts (already checked against our adapter
 * API) with a peer install-smoke import prepended, so `tsc` fails if the peer no longer exists,
 * resolves, or type-checks at that version. Isolated per job (frameworks never share a dep graph).
 *
 *   node ci/compat-matrix/run.mjs --peer ai --spec ">=5.0.0 <6" --framework vercel \
 *       --canary ci/compat-matrix/canaries/vercel.ts --dedicated true
 *
 * --dedicated true  → the canary already imports the framework (asserts our output vs its typed call site);
 *                     used verbatim.
 * --dedicated false → the canary is an examples/frameworks/<fw>.ts (adapter-API only); a peer install-smoke
 *                     import is prepended so `tsc` still exercises the real peer at this version.
 *
 * Run from the repo root AFTER `npm ci && npm run build` (the runner installs the built dist).
 */
import { execSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0 || i + 1 >= process.argv.length) throw new Error(`compat-matrix run: missing --${name}`);
  return process.argv[i + 1];
}

const peer = arg("peer");
const spec = arg("spec");
const framework = arg("framework");
const canaryPath = arg("canary");
const dedicated = arg("dedicated") === "true";

const repoRoot = process.cwd();
const dir = mkdtempSync(join(tmpdir(), `compat-${framework}-`));

// Run a command through the platform shell (so npm resolves on Windows + Linux) with cwd = the temp
// project. Args carrying spaces / range operators (`>=x <y`) are quoted, which is safe on both sh and
// cmd (quotes protect the `<`/`>` from redirection). Inputs come from our own compatibility.json (trusted).
const sh = (cmd) => execSync(cmd, { cwd: dir, stdio: "inherit" });

try {
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify({ name: "actrone-compat-canary", private: true, version: "0.0.0", type: "module" }, null, 2),
  );

  // Isolated install: the built local package + the peer at the pinned spec + a TS toolchain.
  console.log(`== install: local package + ${peer}@'${spec}' + typescript ==`);
  sh(`npm install --no-audit --no-fund "${repoRoot}" "${peer}@${spec}" typescript@5 @types/node@22`);

  writeFileSync(
    join(dir, "tsconfig.json"),
    JSON.stringify(
      {
        compilerOptions: {
          target: "ES2023",
          module: "NodeNext",
          moduleResolution: "NodeNext",
          strict: true,
          noEmit: true,
          skipLibCheck: true,
          esModuleInterop: true,
          types: ["node"],
        },
        include: ["canary.ts"],
      },
      null,
      2,
    ),
  );

  // A dedicated canary already imports the framework and asserts our output against its typed call site,
  // use it verbatim. Otherwise the example only exercises our adapter API, so prepend a peer install-smoke
  // import (module + types must resolve at this version). Either way `tsc` runs against the REAL peer.
  const src = readFileSync(resolve(repoRoot, canaryPath), "utf8");
  const canary = dedicated
    ? src
    : `// GENERATED compat canary: ${framework} @ ${spec} (do not edit)\n` +
      `import * as _compatPeer from ${JSON.stringify(peer)};\n` +
      `void _compatPeer;\n\n` +
      src;
  writeFileSync(join(dir, "canary.ts"), canary);

  console.log(`== tsc: canary vs ${peer}@${spec} ==`);
  sh(`npx tsc --noEmit -p tsconfig.json`);
  console.log(`== OK: ${framework} @ ${spec} ==`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
