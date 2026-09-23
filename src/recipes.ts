import { EXAMPLE_SNIPPETS } from "./generated/example-snippets.js";

/**
 * Framework recipes: the "install, paste, run" onboarding surface. Selection, not detection: the
 * developer picks a framework and gets a short, runnable recipe. Each recipe's code is the `#region`
 * block of a type-checked example under `examples/frameworks/`, generated into
 * `src/generated/example-snippets.ts` by `npm run snippets` and drift-checked in CI, so what the
 * `actrone-memory add` CLI prints and writes is exactly the code CI compiles.
 */

/** The line that ends every recipe: where hosted, governed memory plugs in later. */
export const HOSTED_UPGRADE_HINT =
  "// Hosted, governed memory: when Actrone's hosted platform launches, swap MemoryManager for its drop-in ActroneMemoryManager.";

export interface Recipe {
  /** Slug used by the CLI (`actrone-memory add <framework>`). */
  readonly framework: string;
  /** Human label. */
  readonly label: string;
  /** The install command (peer deps included). */
  readonly install: string;
  /** The compiled example code, ending with the hosted-upgrade line. */
  readonly snippet: string;
}

/** Slug, label and the framework's own package, in the order the recipes were introduced. */
const FRAMEWORKS: ReadonlyArray<readonly [framework: string, label: string, peer: string]> = [
  ["core", "Framework-agnostic core", ""],
  ["vercel", "Vercel AI SDK", "ai"],
  ["langchain", "LangChain.js", "@langchain/core"],
  ["langgraph", "LangGraph.js", "@langchain/langgraph"],
  ["mastra", "Mastra", "@mastra/core"],
  ["llamaindex", "LlamaIndex.TS", "llamaindex"],
  ["openai-agents", "OpenAI Agents JS", "@openai/agents"],
  ["genkit", "Firebase Genkit", "genkit"],
  ["voltagent", "VoltAgent", "@voltagent/core"],
  ["claude-agent-sdk", "Claude Agent SDK", "@anthropic-ai/claude-agent-sdk"],
  ["cloudflare-agents", "Cloudflare Agents", "agents"],
  ["inngest-agentkit", "Inngest AgentKit", "@inngest/agent-kit"],
];

/**
 * All recipes, keyed by framework slug. A framework whose example is missing is left out rather
 * than breaking the import; the test suite requires every framework above to have one.
 */
export const RECIPES: Readonly<Record<string, Recipe>> = Object.fromEntries(
  FRAMEWORKS.flatMap(([framework, label, peer]) => {
    const code = EXAMPLE_SNIPPETS[framework];
    if (code === undefined) return [];
    const install = peer ? `npm i actrone-memory ${peer}` : "npm i actrone-memory";
    const recipe: Recipe = { framework, label, install, snippet: `${code.trimEnd()}\n${HOSTED_UPGRADE_HINT}` };
    return [[framework, recipe]];
  }),
);

/** Every framework slug the recipes cover, including any whose example is missing (for tests). */
export const RECIPE_FRAMEWORKS: readonly string[] = FRAMEWORKS.map(([framework]) => framework);

/** The framework slugs, sorted, for `--list` and validation. */
export function listFrameworks(): string[] {
  return Object.keys(RECIPES).sort();
}

/** Look up a recipe by slug (case-insensitive). */
export function getRecipe(framework: string): Recipe | undefined {
  return RECIPES[framework.trim().toLowerCase()];
}

/** Render a recipe as a readable "install → paste → run" block for stdout. */
export function renderRecipe(r: Recipe): string {
  return (
    `# ${r.label}: memory in a few lines\n\n` +
    `1) Install\n   ${r.install}\n\n` +
    `2) Paste into your agent (or a new file), replacing the example ids, query and answer\n\n${r.snippet}\n\n` +
    "This is the code of a type-checked example (examples/frameworks/), compiled in CI against the " +
    "current adapter API. Docs: https://actrone.com/docs/memory/overview"
  );
}

/** Render a recipe as a self-contained new file for `--write` (never edits yours). */
export function renderStandaloneFile(r: Recipe): string {
  return (
    `// actrone-memory: ${r.label} recipe (generated; safe to edit).\n` +
    `// Install: ${r.install}\n` +
    "// This is a NEW self-contained file that compiles as written. Replace the example ids, query and\n" +
    "// answer with your own, then import what you need from it into your agent.\n\n" +
    `${r.snippet}\n`
  );
}
