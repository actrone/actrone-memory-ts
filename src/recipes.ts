/**
 * Framework recipes — the "install → paste → run" onboarding surface (§4b of the
 * memory roadmap). Selection, not detection: the developer picks a framework and
 * gets a short, runnable, identical-shape recipe. These are the single source of
 * truth for the `actrone-memory add` CLI, the docs, and the CI-tested examples —
 * so what we print is exactly what CI runs.
 */

/** The seed line that ends every recipe: the one-import path to hosted memory. */
export const HOSTED_UPGRADE_HINT =
  "// ⬆ swap MemoryManager for @actrone/sdk's ActroneMemoryManager → hosted, governed";

export interface Recipe {
  /** Slug used by the CLI (`actrone-memory add <framework>`). */
  readonly framework: string;
  /** Human label. */
  readonly label: string;
  /** The install command (peer deps included). */
  readonly install: string;
  /** The paste-in snippet (ends with the hosted-upgrade seed). */
  readonly snippet: string;
}

const CORE_HEADER =
  'import { MemoryManager } from "@actrone/memory";\n' +
  "const mm = await MemoryManager.create(); // zero services, local by default\n";

function recipe(framework: string, label: string, peer: string, body: string): Recipe {
  const install = peer ? `npm i @actrone/memory ${peer}` : "npm i @actrone/memory";
  return { framework, label, install, snippet: `${body}\n${HOSTED_UPGRADE_HINT}` };
}

/** All recipes, keyed by framework slug. Identical shape for every framework. */
export const RECIPES: Readonly<Record<string, Recipe>> = {
  core: recipe(
    "core",
    "Framework-agnostic core",
    "",
    CORE_HEADER +
      'import { memoryFor } from "@actrone/memory/adapters";\n\n' +
      'const memory = memoryFor(mm, "support-bot", sessionId);\n' +
      "const { systemPrompt } = await memory.recall(userInput);\n" +
      "// ...call your LLM with systemPrompt prepended...\n" +
      "await memory.remember(userInput, answer);",
  ),
  vercel: recipe(
    "vercel",
    "Vercel AI SDK",
    "ai",
    CORE_HEADER +
      'import { vercelMemory } from "@actrone/memory/adapters";\n' +
      'import { generateText } from "ai";\n\n' +
      "const mem = await vercelMemory(mm, { agentId, sessionId, query: prompt });\n" +
      "const res = await generateText({\n" +
      "  model, prompt, system: mem.system, onFinish: mem.onFinish(prompt),\n" +
      "});",
  ),
  langchain: recipe(
    "langchain",
    "LangChain.js",
    "@langchain/core",
    CORE_HEADER +
      'import { langchainMemory } from "@actrone/memory/adapters";\n\n' +
      "const memory = langchainMemory(mm, { agentId, sessionId });\n" +
      "const context = await memory.loadContext(userInput); // prepend to your prompt\n" +
      "await memory.saveTurn(userInput, answer);",
  ),
  langgraph: recipe(
    "langgraph",
    "LangGraph.js",
    "@langchain/langgraph",
    CORE_HEADER +
      'import { langgraphMemory } from "@actrone/memory/adapters";\n\n' +
      "const memory = langgraphMemory(mm, { agentId, sessionId });\n" +
      "// pre-model node: merge recalled memory into state.messages\n" +
      "const sys = await memory.loadMemories(latestUserText);\n" +
      "// post-model node: persist the completed turn\n" +
      "await memory.saveTurn(latestUserText, assistantText);",
  ),
  mastra: recipe(
    "mastra",
    "Mastra",
    "@mastra/core",
    CORE_HEADER +
      'import { mastraMemory } from "@actrone/memory/adapters";\n\n' +
      "const memory = mastraMemory(mm, { agentId, sessionId });\n" +
      "const system = await memory.getSystemContext(userInput);\n" +
      "// ...agent.generate({ ...context, system })...\n" +
      "await memory.remember(userInput, answer);",
  ),
  llamaindex: recipe(
    "llamaindex",
    "LlamaIndex.TS",
    "llamaindex",
    CORE_HEADER +
      'import { llamaindexMemory } from "@actrone/memory/adapters";\n\n' +
      "const memory = llamaindexMemory(mm, { agentId, sessionId });\n" +
      "const systemPrompt = await memory.getSystemPrompt(userInput);\n" +
      "// ...agent.chat({ message: userInput, systemPrompt })...\n" +
      "await memory.saveTurn(userInput, answer);",
  ),
  "openai-agents": recipe(
    "openai-agents",
    "OpenAI Agents JS",
    "@openai/agents",
    CORE_HEADER +
      'import { openaiAgentsMemory } from "@actrone/memory/adapters";\n\n' +
      "const memory = openaiAgentsMemory(mm, { agentId, sessionId });\n" +
      "const instructions = await memory.withMemory(baseInstructions, userInput);\n" +
      "// ...run(new Agent({ instructions }), userInput)...\n" +
      "await memory.remember(userInput, answer);",
  ),
  genkit: recipe(
    "genkit",
    "Firebase Genkit",
    "genkit",
    CORE_HEADER +
      'import { genkitMemory } from "@actrone/memory/adapters";\n\n' +
      "const memory = genkitMemory(mm, { agentId, sessionId });\n" +
      "const system = await memory.getSystem(userInput);\n" +
      "// ...ai.generate({ system, prompt: userInput })...\n" +
      "await memory.remember(userInput, answer);",
  ),
};

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
    `# ${r.label} — memory in a few lines\n\n` +
    `1) Install\n   ${r.install}\n\n` +
    `2) Paste into your agent (or a new file)\n\n${r.snippet}\n\n` +
    "Every framework recipe is typechecked in CI against the current adapter API " +
    "(examples/frameworks/). Docs: https://docs.actrone.com/memory"
  );
}

/** Render a recipe as a self-contained new file for `--write` (never edits yours). */
export function renderStandaloneFile(r: Recipe): string {
  return (
    `// actrone-memory — ${r.label} recipe (generated; safe to edit).\n` +
    `// Install: ${r.install}\n` +
    "// This is a NEW self-contained file. Import what you need from it into your agent.\n\n" +
    `${r.snippet}\n`
  );
}
