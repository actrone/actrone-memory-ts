import { defineConfig } from "vitest/config";

/**
 * Vitest configuration for `@actrone/memory`.
 *
 * Tests run in the Node environment. The default in-memory store + local
 * embedder need no external services, so the whole contract suite runs offline.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/index.ts"],
    },
  },
});
