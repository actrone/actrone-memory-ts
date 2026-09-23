import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { EXAMPLE_SNIPPETS } from "../src/generated/example-snippets.js";
import { getRecipe, listFrameworks } from "../src/index.js";
import { RECIPE_FRAMEWORKS } from "../src/recipes.js";

/**
 * Trust gate: every framework recipe must be backed by a real, CI-typechecked example
 * under examples/frameworks/ whose `#region <fw>` snippet is extracted into examples/snippets.json.
 * `typecheck:examples` compiles those examples against the current adapter API in CI, so a recipe
 * whose wiring stops compiling fails the build: the recipes are verified, not just strings.
 */
const here = dirname(fileURLToPath(import.meta.url));
const snippets = JSON.parse(
  readFileSync(resolve(here, "../examples/snippets.json"), "utf8"),
) as Record<string, string>;

describe("recipes are backed by CI-typechecked examples", () => {
  it("has a non-empty extracted example snippet for every framework recipe", () => {
    for (const fw of listFrameworks()) {
      const snippet = snippets[fw];
      expect(snippet, `missing examples/frameworks/${fw}.ts #region ${fw}`).toBeTruthy();
      // The example wires the framework via the current adapter API.
      expect(snippet).toContain("actrone-memory");
      expect(snippet).toContain("MemoryManager.create()");
    }
  });

  it("does not have example snippets for frameworks that are not recipes", () => {
    const known = new Set([...listFrameworks(), "memory-ts-quickstart"]);
    for (const id of Object.keys(snippets)) {
      expect(known.has(id), `orphan snippet id "${id}"`).toBe(true);
    }
  });
});

describe("the CLI prints exactly the type-checked example code", () => {
  // Before this gate the CLI's recipes were hand-typed strings that drifted from the examples: they
  // used undefined variables, so a `--write` file did not compile, and the Vercel recipe passed
  // `onFinish` to `generateText`, which has none, so a turn was never saved.
  it("has a recipe for every framework, none dropped for a missing example", () => {
    expect(listFrameworks()).toEqual([...RECIPE_FRAMEWORKS].sort());
  });

  it.each(RECIPE_FRAMEWORKS)("the %s recipe is its example's code", (framework) => {
    const recipe = getRecipe(framework);
    expect(EXAMPLE_SNIPPETS[framework]).toBe(snippets[framework]);
    expect(recipe?.snippet.startsWith((snippets[framework] ?? "").trimEnd())).toBe(true);
  });

  it("never wires memory through generateText's non-existent onFinish", () => {
    const code = getRecipe("vercel")?.snippet ?? "";
    expect(code).not.toMatch(/generateText\(\{[^)]*onFinish/);
  });
});
