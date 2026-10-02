import { defineConfig } from "tsup";

/**
 * Build configuration for `actrone-memory`.
 *
 * ESM-only, with type declarations. `zod` is a regular `dependency` (package.json),
 * not bundled into `dist`: consumers already resolve it via npm, and keeping it
 * external avoids a duplicate copy when used alongside `@actrone/sdk`.
 */
export default defineConfig({
  entry: ["src/index.ts", "src/adapters.ts", "src/testing.ts", "src/cli.ts"],
  format: ["esm"],
  // tsup's declaration build sets `baseUrl` internally, which TypeScript 6 deprecates (TS5101).
  // TypeScript 7 removes the compiler API tsup builds declarations with, so the move to 7 replaces
  // this build step rather than this flag.
  dts: { compilerOptions: { ignoreDeprecations: "6.0" } },
  sourcemap: true,
  clean: true,
  treeshake: true,
  target: "es2023",
  external: ["zod"],
});
