import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

/**
 * Vitest configuration for `actrone-memory`.
 *
 * Tests run in the Node environment. The default in-memory store + local
 * embedder need no external services, so the whole contract suite runs offline.
 */
export default defineConfig({
  resolve: {
    // The examples import the package by its published name, as a consumer would. Tests that run
    // them resolve that name to the source. Exact match only, so `actrone-memory/adapters` is untouched.
    alias: [{ find: /^actrone-memory$/, replacement: fileURLToPath(new URL("./src/index.ts", import.meta.url)) }],
  },
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    // Pins "fastembed is not installed" for every test, so no run depends on the machine or
    // downloads a model (see test/setup.ts).
    setupFiles: ["test/setup.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/index.ts"],
    },
  },
});
