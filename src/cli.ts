#!/usr/bin/env node
import { existsSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

import { getRecipe, listFrameworks, renderRecipe, renderStandaloneFile } from "./recipes.js";

/**
 * `actrone-memory` CLI — the non-destructive, existing-project onboarding path
 * (§4b). It only **prints** a framework recipe or **creates one new file**; it
 * never reads or edits your existing code. `create-actrone-app` is the greenfield
 * counterpart.
 *
 *   npx @actrone/memory add langgraph              # print install + recipe
 *   npx @actrone/memory add langgraph --write memory.ts   # write ONE new file
 *   npx @actrone/memory list                       # list frameworks
 */

/** Injected IO so the command logic is unit-testable without touching disk. */
export interface CliIO {
  log(message: string): void;
  error(message: string): void;
  fileExists(path: string): boolean;
  writeFile(path: string, content: string): void;
}

const USAGE =
  "actrone-memory — add memory to your agent (non-destructive)\n\n" +
  "Usage:\n" +
  "  actrone-memory add <framework> [--write <file>]   print a recipe, or write ONE new file\n" +
  "  actrone-memory list                               list supported frameworks\n\n" +
  `Frameworks: ${listFrameworks().join(", ")}`;

/**
 * Run the CLI with parsed args (everything after the binary name) against an
 * injected {@link CliIO}. Returns a process exit code (0 = success).
 */
export function runCli(args: readonly string[], io: CliIO): number {
  const [command, ...rest] = args;

  if (command === undefined || command === "help" || command === "--help" || command === "-h") {
    io.log(USAGE);
    return command === undefined ? 1 : 0;
  }

  if (command === "list" || command === "--list") {
    io.log(listFrameworks().join("\n"));
    return 0;
  }

  if (command !== "add") {
    io.error(`Unknown command: ${command}\n\n${USAGE}`);
    return 1;
  }

  const framework = rest.find((a) => !a.startsWith("--"));
  if (framework === undefined) {
    io.error(`Missing framework.\n\n${USAGE}`);
    return 1;
  }

  const recipe = getRecipe(framework);
  if (recipe === undefined) {
    io.error(
      `Unknown framework: ${framework}\nAvailable: ${listFrameworks().join(", ")}`,
    );
    return 1;
  }

  const writeIdx = rest.indexOf("--write");
  if (writeIdx >= 0) {
    const target = rest[writeIdx + 1];
    if (target === undefined || target.startsWith("--")) {
      io.error("--write requires a file path, e.g. --write memory.ts");
      return 1;
    }
    if (io.fileExists(target)) {
      // Non-destructive contract: never overwrite existing files.
      io.error(`Refusing to overwrite existing file: ${target}`);
      return 1;
    }
    io.writeFile(target, renderStandaloneFile(recipe));
    io.log(
      `Wrote ${target} (a new self-contained file).\n` +
        `Install: ${recipe.install}\n` +
        "Import what you need from it into your agent — nothing in your project was modified.",
    );
    return 0;
  }

  io.log(renderRecipe(recipe));
  return 0;
}

/** Wire real IO + process and run. */
function main(): void {
  const io: CliIO = {
    log: (m) => process.stdout.write(`${m}\n`),
    error: (m) => process.stderr.write(`${m}\n`),
    fileExists: (p) => existsSync(p),
    writeFile: (p, c) => writeFileSync(p, c, "utf8"),
  };
  process.exit(runCli(process.argv.slice(2), io));
}

// Only run when invoked as the binary, not when imported by tests.
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
