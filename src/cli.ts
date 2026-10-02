#!/usr/bin/env node
import { existsSync, realpathSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { getRecipe, listFrameworks, renderRecipe, renderStandaloneFile } from "./recipes.js";

/**
 * `actrone-memory` CLI: the non-destructive, existing-project onboarding path
 *. It only **prints** a framework recipe or **creates one new file**; it
 * never reads or edits your existing code. `create-actrone-app` is the greenfield
 * counterpart.
 *
 *   npx actrone-memory add langgraph              # print install + recipe
 *   npx actrone-memory add langgraph --write memory.ts   # write ONE new file
 *   npx actrone-memory list                       # list frameworks
 */

/** Injected IO so the command logic is unit-testable without touching disk. */
export interface CliIO {
  log(message: string): void;
  error(message: string): void;
  fileExists(path: string): boolean;
  writeFile(path: string, content: string): void;
}

const USAGE =
  "actrone-memory: add memory to your agent (non-destructive)\n\n" +
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
        "Import what you need from it into your agent; nothing in your project was modified.",
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

/**
 * True when this module is the program being run, so importing it (tests) runs nothing.
 *
 * Node resolves symlinks for `import.meta.url` but not for `process.argv[1]`, and on macOS and
 * Linux npm installs a package's command as a symlink (`node_modules/.bin/actrone-memory`).
 * Comparing the two as given never matched there, so `npx actrone-memory` exited 0 without doing
 * anything. Both sides are resolved first. Windows was unaffected: npm uses a command shim there.
 *
 * @param entry `process.argv[1]`, the path the program was started with.
 * @param moduleUrl `import.meta.url` of this module.
 * @param realpath resolves a path through any symlinks; injectable for tests.
 * @returns false when either path cannot be resolved.
 */
export function isEntryPoint(
  entry: string | undefined,
  moduleUrl: string,
  realpath: (path: string) => string = realpathSync,
): boolean {
  if (entry === undefined) return false;
  try {
    return realpath(entry) === realpath(fileURLToPath(moduleUrl));
  } catch {
    return false;
  }
}

if (isEntryPoint(process.argv[1], import.meta.url)) {
  main();
}
