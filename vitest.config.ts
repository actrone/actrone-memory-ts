import { defineConfig } from "vitest/config";

/**
 * Vitest configuration for `actrone-memory`.
 *
 * Tests run in the Node environment. The default in-memory store + local
 * embedder need no external services, so the whole contract suite runs offline.
 */
export default defineConfig({
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
