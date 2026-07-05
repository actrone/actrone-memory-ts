import { defineConfig } from "tsup";

/**
 * Build configuration for `@actrone/memory`.
 *
 * ESM-only, with type declarations. `zod` is bundled as a dependency (not
 * externalised) consumers already resolve it; keeping it external avoids a
 * duplicate copy when used alongside `@actrone/sdk`.
 */
export default defineConfig({
  entry: ["src/index.ts", "src/adapters.ts"],
  format: ["esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  target: "es2023",
  external: ["zod"],
});
