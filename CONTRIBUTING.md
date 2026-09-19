# Contributing to @actrone/memory

First off, thank you for wanting to help. Whether it's fixing a typo, improving a code example, or building a new integration, every contribution matters.

This document walks you through everything you need to get set up and submit a pull request.

---

## What You'll Need Before You Start

- **Node.js 22 or newer**, check with `node --version`
- **npm** (the repo is developed and tested against the `package-lock.json` lockfile, so please don't switch to pnpm/yarn for a PR)

No Docker, no local Redis or Qdrant: the test suite runs entirely against in-memory fakes of the store interfaces, so `npm test` needs no external services.

---

## Setting Up Your Development Environment

```bash
# 1. Fork the repo on GitHub, then clone your fork
git clone https://github.com/YOUR_USERNAME/actrone-memory-ts
cd actrone-memory-ts

# 2. Install dependencies from the lockfile
npm ci
```

You're ready.

---

## Running the Tests

```bash
npm test            # run the full vitest suite once
npm run test:watch  # re-run on file change while you work
```

**All pull requests must pass the full test suite.** CI runs this automatically and blocks the PR if it fails.

### Checking types and the build

```bash
npm run typecheck   # tsc --noEmit, strict mode
npm run build       # tsup, must succeed cleanly
```

Both must pass with zero errors before your PR will be reviewed. There's no separate lint step: the type checker in strict mode is the primary static gate.

### If you touch a framework adapter or example

```bash
npm run typecheck:examples  # the documented example snippets must still compile
npm run snippets:check      # the docs site's code samples must match the example source
npm run docs:api            # TypeDoc must generate cleanly (a broken @link fails this)
```

---

## How the Codebase is Structured

If you're new to the project, here's where things live:

```text
src/
│
├── index.ts          ← Public entry point, re-exports everything below.
├── manager.ts         ← MemoryManager, the main public interface. Start here.
├── config.ts           ← MemoryConfig and defaults.
├── models.ts            ← Data types (MemoryEntry, Turn, RetrievedContext, etc.)
├── errors.ts              ← Custom error classes.
├── retrieval.ts             ← The 4-phase retrieval pipeline.
├── embedder.ts                ← Local (hashing) and OpenAI embedders.
├── rerank.ts                    ← Opt-in cross-encoder reranking.
├── extraction.ts                  ← Opt-in LLM fact extraction.
│
├── stores/
│   ├── redis.ts                     ← L1 store adapter (structural, no hard `redis` dependency).
│   └── qdrant.ts                      ← L2 store adapter (structural, no hard `@qdrant/js-client-rest` dependency).
│
└── adapters.ts                          ← Framework adapters (LangChain.js, LangGraph.js, Mastra, and more).

test/    ← One file per source module, vitest. Store adapters are tested against in-memory
           fakes of the Redis/Qdrant client surface (see FakeRedis in stores.test.ts), not real
           services, so tests stay fast and need no local infrastructure.
```

---

## Code Style Rules

We keep things consistent so the codebase stays readable for everyone:

- **Type everything.** No implicit `any`. `tsc --noEmit` in strict mode is the gate; if it's not typed, the PR won't pass.
- **Adapters stay structural.** Framework adapters (`adapters.ts`) duck-type the framework's own primitives rather than importing the framework package, so every framework stays an optional peer dependency. Don't add a hard dependency on a framework package to make an adapter work.
- **No blocking calls inside an async function.**
- **ESM only.** No CommonJS `require`.

---

## Submitting a Pull Request

```text
1. Create a branch from main
   git checkout -b feat/your-feature-name

2. Make your changes and write tests for them

3. Run the checks and confirm they pass
   npm run typecheck && npm test && npm run build

4. Commit using Conventional Commits format:
   feat: add Genkit memory adapter
   fix: handle a missing sessionId in eraseAgentMemories
   docs: add an example for multi-agent memory sharing
   test: add coverage for the retrieval budget allocator

5. Push and open a pull request against main
```

**In your PR description, explain *why* the change is needed**, not just what you changed. "Fixes a bug" tells us nothing; "the Redis store adapter didn't release the connection on a failed `rpush`, causing a leak under retry" tells us everything.

### What we look for in review

- Does this solve a real problem without adding unnecessary complexity?
- Are all new code paths covered by tests, including error cases?
- Does it follow the existing async patterns in `manager.ts`?
- If it's a new framework adapter: does it stay structural (no hard dependency on the framework package), and does it match the method-naming convention the other adapters already use (a context-retrieval method paired with `remember`/`saveTurn`)?
- Are any new dependencies justified, stable, and pinned?

---

## Reporting a Bug

Open a [GitHub Issue](https://github.com/actrone/actrone-memory-ts/issues) with:

- Your Node.js version (`node --version`) and OS
- A minimal code snippet that reproduces the problem
- What you expected to happen vs. what actually happened
- Any relevant error messages or logs (redact API keys and personal data before pasting)

For security vulnerabilities, **do not open a public issue**, see [SECURITY.md](SECURITY.md) for the private reporting process.

---

## Questions?

Open a [Discussion](https://github.com/actrone/actrone-memory-ts/discussions) on GitHub, no question is too basic.
