import { setFastEmbedLoaderForTests } from "../src/embedder.js";

// Every test sees "fastembed is not installed", deterministically: the suite must not depend on
// whether the optional peer happens to be resolvable from a parent node_modules, and must never
// download a model. Tests of the fastembed path inject their own stand-in through the same seam.
export const FASTEMBED_MISSING = (): Promise<never> =>
  Promise.reject(Object.assign(new Error("Cannot find package 'fastembed'"), { code: "ERR_MODULE_NOT_FOUND" }));

setFastEmbedLoaderForTests(FASTEMBED_MISSING);
