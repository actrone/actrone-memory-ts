import { defineConfig } from "tsup";

/**
 * Build configuration for `@actrone/memory`.
 *
 * ESM-only, with type declarations. `zod` is a regular `dependency` (package.json),
 * not bundled into `dist`: consumers already resolve it via npm, and keeping it
 * external avoids a duplicate copy when used alongside `@actrone/sdk`.
 */
export default defineConfig({
  entry: ["src/index.ts", "src/adapters.ts", "src/testing.ts", "src/cli.ts"],
  format: ["esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  target: "es2023",
  external: ["zod"],
});
