# Typed-call-site canaries

Files here are the **deep** end of the framework compatibility matrix. Each `<framework>.ts` imports the
**real** framework peer and asserts that our adapter's output still fits that framework's **typed call
site** at the installed version. The version-matrix (`../matrix.mjs` + `../run.mjs`) installs the peer at
floor / current / next and runs `tsc` on the canary; a framework release that changes the shape our
adapter feeds fails **here**, not for a user.

They are deliberately **not** under `examples/`, that tree is type-checked with **no** framework peers
installed, so a real `import … from "ai"` would break it. A framework with a canary here is auto-detected
by `matrix.mjs` (`dedicated: true`); one without falls back to its `examples/frameworks/<fw>.ts` plus a
peer install-smoke import (does the peer still install + resolve + type-check).

## The pattern

Extract the framework's real option/argument type and assert only the fields we supply, no live model
needed:

```ts
import { streamText } from "ai";
type StreamTextOptions = Parameters<typeof streamText>[0];
const _ = { onFinish: mem.onFinish(prompt) } satisfies Partial<StreamTextOptions>;
```

## When a canary is worth writing

Only where **our output is directly assignable to a framework type**, e.g. `vercelMemory().onFinish`
(→ `streamText`'s `onFinish`) or a governed tool map (→ `generateText`'s `tools`). That's the whole value:
catching a real assignability break across framework versions.

**Not** for adapters that return **our own** shapes the developer wires in by hand (`langchainMemory` →
`{ loadContext, saveTurn }`, `vercelMemory` → `{ system, onFinish }` used piecemeal): there's no single
framework type to satisfy, so install-smoke is the correct depth.

**Not** for the **cast-requiring** duck-type adapters (`langchainChatHistory`, `llamaindexChatMemory`): by
design they return a structural object that only satisfies the framework interface **after a cast**
(`as unknown as BaseChatMessageHistory`: see the adapter docstring), because they never import the
framework. A clean `satisfies` cannot hold, so these stay at install-smoke too. That is a property of the
adapter design, not a coverage gap.

## Adding one

Drop a `<framework>.ts` that imports the peer + our adapter and `satisfies`-checks the fitting field(s).
Verify locally:

```bash
npm run build
node ci/compat-matrix/run.mjs --peer <peer> --spec <floor-version> \
  --framework <fw> --canary ci/compat-matrix/canaries/<fw>.ts --dedicated true
```
