import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { describe, expect, it } from "vitest";

import {
  getRecipe,
  HOSTED_UPGRADE_HINT,
  listFrameworks,
  RECIPES,
  renderRecipe,
  renderStandaloneFile,
} from "../src/index.js";
import { type CliIO, isEntryPoint, runCli } from "../src/cli.js";

/** Recording IO fake: no disk, no process. */
function makeIO(existing: Set<string> = new Set()): CliIO & {
  out: string[];
  err: string[];
  written: Map<string, string>;
} {
  const out: string[] = [];
  const err: string[] = [];
  const written = new Map<string, string>();
  return {
    out,
    err,
    written,
    log: (m) => out.push(m),
    error: (m) => err.push(m),
    fileExists: (p) => existing.has(p) || written.has(p),
    writeFile: (p, c) => written.set(p, c),
  };
}

describe("recipes registry", () => {
  it("has an identical-shape recipe for every framework, ending with the hosted seed", () => {
    const slugs = listFrameworks();
    expect(slugs).toContain("langgraph");
    expect(slugs).toContain("core");
    for (const slug of slugs) {
      const r = RECIPES[slug];
      expect(r?.framework).toBe(slug);
      expect(r?.install).toContain("actrone-memory");
      expect(r?.snippet).toContain("MemoryManager.create()");
      expect(r?.snippet.trimEnd().endsWith(HOSTED_UPGRADE_HINT)).toBe(true);
    }
  });

  it("looks up recipes case-insensitively", () => {
    expect(getRecipe("LangGraph")?.framework).toBe("langgraph");
    expect(getRecipe("nope")).toBeUndefined();
  });

  it("renders a readable recipe block and a self-contained file", () => {
    const r = getRecipe("vercel")!;
    expect(renderRecipe(r)).toContain("1) Install");
    expect(renderRecipe(r)).toContain("adapter API");
    expect(renderStandaloneFile(r)).toContain("self-contained file");
  });
});

describe("cli", () => {
  it("prints a recipe for `add <framework>`", () => {
    const io = makeIO();
    const code = runCli(["add", "langgraph"], io);
    expect(code).toBe(0);
    expect(io.out.join("\n")).toContain("LangGraph");
    expect(io.written.size).toBe(0); // nothing written to disk
  });

  it("lists frameworks", () => {
    const io = makeIO();
    expect(runCli(["list"], io)).toBe(0);
    expect(io.out.join("\n")).toContain("langgraph");
  });

  it("errors on an unknown framework", () => {
    const io = makeIO();
    expect(runCli(["add", "django"], io)).toBe(1);
    expect(io.err.join("\n")).toContain("Unknown framework");
  });

  it("writes ONE new file with --write", () => {
    const io = makeIO();
    const code = runCli(["add", "core", "--write", "memory.ts"], io);
    expect(code).toBe(0);
    expect(io.written.get("memory.ts")).toContain("MemoryManager.create()");
    expect(io.out.join("\n")).toContain("nothing in your project was modified");
  });

  it("refuses to overwrite an existing file (non-destructive)", () => {
    const io = makeIO(new Set(["memory.ts"]));
    expect(runCli(["add", "core", "--write", "memory.ts"], io)).toBe(1);
    expect(io.err.join("\n")).toContain("Refusing to overwrite");
    expect(io.written.size).toBe(0);
  });

  it("errors when --write has no path", () => {
    const io = makeIO();
    expect(runCli(["add", "core", "--write"], io)).toBe(1);
    expect(io.err.join("\n")).toContain("--write requires a file path");
  });

  it("shows usage with exit 1 when no command is given", () => {
    const io = makeIO();
    expect(runCli([], io)).toBe(1);
    expect(io.out.join("\n")).toContain("Usage:");
  });
});

describe("isEntryPoint", () => {
  // npm installs a package's command as a symlink on macOS and Linux. Node resolves symlinks for
  // import.meta.url but not for process.argv[1]; 0.1.0 to 0.1.2 compared them as given, so
  // `npx actrone-memory` exited without doing anything there.
  const realFile = resolve("/pkg/node_modules/actrone-memory/dist/cli.js");
  const linkFile = resolve("/pkg/node_modules/.bin/actrone-memory");
  const links = new Map([[linkFile, realFile]]);
  const fakeRealpath = (path: string) => links.get(path) ?? path;

  it("is true when started through a symlink to this module", () => {
    expect(isEntryPoint(linkFile, pathToFileURL(realFile).href, fakeRealpath)).toBe(true);
  });

  it("is true when started directly", () => {
    expect(isEntryPoint(realFile, pathToFileURL(realFile).href, fakeRealpath)).toBe(true);
  });

  it("is false when another program imports this module", () => {
    expect(isEntryPoint(resolve("/pkg/node_modules/vitest/vitest.mjs"), pathToFileURL(realFile).href, fakeRealpath)).toBe(false);
    expect(isEntryPoint(undefined, pathToFileURL(realFile).href, fakeRealpath)).toBe(false);
  });

  it("is false when a path cannot be resolved", () => {
    const missing = () => {
      throw new Error("ENOENT");
    };
    expect(isEntryPoint(linkFile, pathToFileURL(realFile).href, missing)).toBe(false);
  });

  it("follows a real link on this filesystem", () => {
    // A directory link, as npm's layout resolves through: a junction on Windows (no admin
    // rights needed), a symlink elsewhere.
    const root = mkdtempSync(join(tmpdir(), "actrone-cli-"));
    try {
      const realDir = join(root, "real");
      mkdirSync(realDir);
      const real = join(realDir, "cli.js");
      writeFileSync(real, "");
      symlinkSync(realDir, join(root, "link"), "junction");
      expect(isEntryPoint(join(root, "link", "cli.js"), pathToFileURL(real).href)).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
