import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { describe, expect, it } from "vitest";

// @ts-expect-error: .mjs tooling script, no types (validated by this test).
import { check, checkAgainst, normaliseRange } from "../scripts/check-compat.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

describe("framework-compatibility drift gate", () => {
  it("the real repo is in sync (compatibility.json ⇄ peerDependencies ⇄ README)", () => {
    const { errors, count } = check(root);
    expect(errors).toEqual([]);
    expect(count).toBeGreaterThanOrEqual(11);
  });

  const manifest = {
    frameworks: {
      demo: { peer: "demo-pkg", range: ">=1.0.0 <2", readme: "Demo" },
    },
  };
  const readmeOk = "| Demo | `demoMemory` | `demo-pkg >=1 <2` |";

  it("passes on a synthetic in-sync package", () => {
    const pkg = {
      peerDependencies: { "demo-pkg": ">=1.0.0 <2" },
      peerDependenciesMeta: { "demo-pkg": { optional: true } },
    };
    expect(checkAgainst(manifest, pkg, readmeOk)).toEqual([]);
  });

  it("catches a wrong range", () => {
    const pkg = {
      peerDependencies: { "demo-pkg": ">=1.0.0 <3" },
      peerDependenciesMeta: { "demo-pkg": { optional: true } },
    };
    expect(checkAgainst(manifest, pkg, readmeOk).some((e: string) => e.includes("!= manifest"))).toBe(true);
  });

  it("catches a non-optional peer", () => {
    const pkg = { peerDependencies: { "demo-pkg": ">=1.0.0 <2" }, peerDependenciesMeta: {} };
    expect(checkAgainst(manifest, pkg, readmeOk).some((e: string) => e.includes("optional"))).toBe(true);
  });

  it("catches a missing README row", () => {
    const pkg = {
      peerDependencies: { "demo-pkg": ">=1.0.0 <2" },
      peerDependenciesMeta: { "demo-pkg": { optional: true } },
    };
    expect(checkAgainst(manifest, pkg, "no matrix").some((e: string) => e.includes("README"))).toBe(true);
  });

  it("catches a README row whose range drifted from the manifest", () => {
    const pkg = {
      peerDependencies: { "demo-pkg": ">=1.0.0 <2" },
      peerDependenciesMeta: { "demo-pkg": { optional: true } },
    };
    const stale = "| Demo | `demoMemory` | `demo-pkg >=0.9 <2` |";
    expect(checkAgainst(manifest, pkg, stale).some((e: string) => e.includes("row says"))).toBe(true);
  });

  it("checks the range in the framework's own row, not another row's", () => {
    const pkg = {
      peerDependencies: { "demo-pkg": ">=1.0.0 <2" },
      peerDependenciesMeta: { "demo-pkg": { optional: true } },
    };
    const elsewhere = "| Demo | `demoMemory` | see below |\n| Other | `x` | `demo-pkg >=1 <2` |";
    expect(checkAgainst(manifest, pkg, elsewhere).some((e: string) => e.includes("missing"))).toBe(true);
  });

  it.each([
    [">=5.0.0 <6", ">=5 <6"],
    [">=0.10.0 <1", ">=0.10 <1"],
    [">=1.0.4 <2", ">=1.0.4 <2"],
    [">=0.0.37 <1", ">=0.0.37 <1"],
  ])("treats %s and the README spelling %s as the same range", (full, short) => {
    expect(normaliseRange(full)).toBe(normaliseRange(short));
  });

  it("catches an undocumented optional peer", () => {
    const pkg = {
      peerDependencies: { "demo-pkg": ">=1.0.0 <2", sneaky: ">=1" },
      peerDependenciesMeta: { "demo-pkg": { optional: true }, sneaky: { optional: true } },
    };
    expect(checkAgainst(manifest, pkg, readmeOk).some((e: string) => e.includes("sneaky"))).toBe(true);
  });
});
