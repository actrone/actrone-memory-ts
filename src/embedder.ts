/**
 * Embedding seam. `MemoryManager.create()` picks the best local embedder available
 * ({@link buildLocalEmbedder}): {@link FastEmbedEmbedder} (bge-small-en-v1.5, semantic) when the
 * optional `fastembed` package is installed, otherwise the dependency-free {@link LocalEmbedder},
 * which hashes words into a bag-of-words vector so cosine similarity reflects shared keywords only.
 * The lexical embedder is deterministic and offline, which also makes the test suite run anywhere.
 *
 * To use a hosted model, pass your own {@link Embedder} (for example one backed by OpenAI
 * `text-embedding-3-small`) and set `relevanceThreshold` for it.
 */
export interface Embedder {
  /** The dimensionality of vectors this embedder produces. */
  readonly dimensions: number;
  /**
   * The cosine similarity at which this model's results turn from unrelated to relevant, used as
   * the admission threshold when {@link MemoryConfig.relevanceThreshold} is not set. Declare it for
   * a custom embedder once you have measured it; leave it out to use the library default.
   */
  readonly relevanceThreshold?: number | undefined;
  /** Embed a single text into a dense vector. */
  embed(text: string): Promise<number[]>;
}

/**
 * Calibrated admission thresholds for the built-in embedders, kept identical to the Python library.
 * Measured on a labelled set of 48 relevant and 528 unrelated query and memory pairs (2026-09-22).
 * The lexical embedder only matches shared words, so no threshold makes it semantic: 0.30 is where
 * it still recalls about 42% of relevant memories while admitting about 7% of unrelated ones.
 * bge-small-en-v1.5 at 0.63 recalls about 88% with about 84% precision, admitting 1.5% of unrelated
 * pairs. The old single default (0.7) recalled 4% with the lexical embedder and 71% with bge-small.
 */
export const LEXICAL_RELEVANCE_THRESHOLD = 0.3;
export const BGE_SMALL_RELEVANCE_THRESHOLD = 0.63;

/** Deterministic, dependency-free hashing embedder (a "hashing vectorizer"). */
export class LocalEmbedder implements Embedder {
  readonly dimensions: number;
  readonly relevanceThreshold = LEXICAL_RELEVANCE_THRESHOLD;

  constructor(dimensions = 256) {
    if (dimensions <= 0) throw new Error("dimensions must be > 0");
    this.dimensions = dimensions;
  }

  async embed(text: string): Promise<number[]> {
    const vec = new Array<number>(this.dimensions).fill(0);
    const words = text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
    for (const word of words) {
      const bucket = hash32(word) % this.dimensions;
      vec[bucket] = (vec[bucket] ?? 0) + 1;
    }
    // L2-normalise so cosine similarity is a plain dot product.
    let norm = 0;
    for (const v of vec) norm += v * v;
    norm = Math.sqrt(norm);
    if (norm === 0) return vec;
    for (let i = 0; i < vec.length; i++) vec[i] = (vec[i] ?? 0) / norm;
    return vec;
  }
}

/** The fastembed-js model id of the default dense model, the same model the Python library uses. */
export const DEFAULT_FASTEMBED_MODEL = "fast-bge-small-en-v1.5";

/** The subset of a fastembed-js `FlagEmbedding` this library uses. */
export interface FastEmbedModel {
  embed(texts: string[], batchSize?: number): AsyncGenerator<ArrayLike<number>[], void, unknown>;
}

/** The subset of the `fastembed` module this library uses. */
export interface FastEmbedModule {
  FlagEmbedding: { init(options: { model?: string; cacheDir?: string }): Promise<FastEmbedModel> };
}

async function importFastEmbed(): Promise<FastEmbedModule> {
  // Variable specifier so tsc and bundlers do not statically resolve the optional peer.
  const pkg = "fastembed";
  return (await import(pkg)) as FastEmbedModule;
}

let loadFastEmbed: () => Promise<FastEmbedModule> = importFastEmbed;

/**
 * Test seam: replace how the optional `fastembed` peer is loaded, so a test suite never depends on
 * whether the package happens to be resolvable (and never downloads a model). Call with no
 * argument to restore the real import.
 */
export function setFastEmbedLoaderForTests(loader?: () => Promise<FastEmbedModule>): void {
  loadFastEmbed = loader ?? importFastEmbed;
}

/**
 * In-process ONNX dense embedder via `fastembed` (fastembed-js, onnxruntime, no torch/GPU). The
 * preferred "real" recall tier: local-first, zero-egress after a one-time model download (about
 * 130 MB), no API key. Default model `bge-small-en-v1.5` (384-dim), the same model the Python
 * library uses. `fastembed` is an optional peer: install it (`npm i fastembed`) and
 * `MemoryManager.create()` picks it up automatically; without it {@link buildLocalEmbedder} degrades
 * to the dependency-free lexical {@link LocalEmbedder}.
 */
export class FastEmbedEmbedder implements Embedder {
  readonly dimensions: number;
  readonly relevanceThreshold: number | undefined;
  readonly #model: FastEmbedModel;

  private constructor(model: FastEmbedModel, dimensions: number, relevanceThreshold: number | undefined) {
    this.#model = model;
    this.dimensions = dimensions;
    this.relevanceThreshold = relevanceThreshold;
  }

  /**
   * Load the model, resolving its dimension by a probe embed. The first call downloads the model
   * into `cacheDir`; every later call loads it from there, offline.
   *
   * @param opts.modelName A fastembed-js model id. Defaults to {@link DEFAULT_FASTEMBED_MODEL}. Only
   *   the default model carries a calibrated `relevanceThreshold`; set one in your config for others.
   * @param opts.cacheDir Where model files are kept. Defaults to `FASTEMBED_CACHE_PATH`, else
   *   `~/.cache/actrone-memory/fastembed`, never the current directory.
   * @throws When `fastembed` is not installed or the model cannot be loaded or downloaded.
   */
  static async create(opts: { modelName?: string; cacheDir?: string } = {}): Promise<FastEmbedEmbedder> {
    const mod = await loadFastEmbed();
    const modelName = opts.modelName ?? DEFAULT_FASTEMBED_MODEL;
    const model = await mod.FlagEmbedding.init({
      model: modelName,
      cacheDir: opts.cacheDir ?? (await defaultModelCacheDir()),
    });
    const probe = await embedOne(model, "probe");
    const threshold = modelName === DEFAULT_FASTEMBED_MODEL ? BGE_SMALL_RELEVANCE_THRESHOLD : undefined;
    return new FastEmbedEmbedder(model, probe.length, threshold);
  }

  async embed(text: string): Promise<number[]> {
    return embedOne(this.#model, text);
  }
}

/**
 * Embed one text with fastembed's plain `embed`, the same call the Python library makes. Its
 * `queryEmbed` prepends "query: ", which would make the two libraries score identical text
 * differently and break the shared calibration.
 */
async function embedOne(model: FastEmbedModel, text: string): Promise<number[]> {
  for await (const batch of model.embed([text], 1)) {
    const vector = batch[0];
    if (vector !== undefined) return Array.from(vector);
  }
  throw new Error("fastembed returned no embedding");
}

/** `FASTEMBED_CACHE_PATH`, else a per-user cache directory. Resolved lazily so edge runtimes never load node:os. */
async function defaultModelCacheDir(): Promise<string> {
  const fromEnv = typeof process !== "undefined" ? process.env["FASTEMBED_CACHE_PATH"] : undefined;
  if (fromEnv) return fromEnv;
  const [{ homedir }, { join }] = await Promise.all([import("node:os"), import("node:path")]);
  return join(homedir(), ".cache", "actrone-memory", "fastembed");
}

/** Warning code for the lexical fallback, so an application can filter it with `process.on("warning")`. */
export const LEXICAL_FALLBACK_WARNING_CODE = "ACTRONE_MEMORY_LEXICAL_EMBEDDER";

let lexicalFallbackWarned = false;

/** Say once per process that recall is keyword-only, and why, the same notice the Python library logs. */
function warnLexicalFallback(error: unknown): void {
  if (lexicalFallbackWarned) return;
  lexicalFallbackWarned = true;
  const code = (error as { code?: unknown } | null)?.code;
  const text = error instanceof Error ? error.message : String(error);
  // Node sets a code; bundlers and test runners word it differently, so accept either signal.
  const missing =
    code === "ERR_MODULE_NOT_FOUND" ||
    code === "MODULE_NOT_FOUND" ||
    /(cannot find (package|module)|could not resolve|failed to (load|resolve)[^\n]*)\W+fastembed\b/i.test(text);
  const reason = missing
    ? "Install fastembed (npm install fastembed) for semantic recall that still runs on this machine."
    : `fastembed is installed, but its model could not be loaded (${text}). ` +
      "The first run downloads about 130 MB; check network access, or set FASTEMBED_CACHE_PATH to a directory that already holds the model.";
  const message = `actrone-memory is using the lexical LocalEmbedder, which recalls memories by shared keywords only. ${reason}`;
  // Edge runtimes may have no `process`; there the fallback still happens, just without the notice.
  if (typeof process !== "undefined" && typeof process.emitWarning === "function") {
    process.emitWarning(message, { code: LEXICAL_FALLBACK_WARNING_CODE });
  }
}

/** Test seam: let the next fallback warn again. */
export function resetLexicalFallbackWarningForTests(): void {
  lexicalFallbackWarned = false;
}

/**
 * Return the best available local, offline, zero-egress embedder, degrading gracefully:
 * in-process ONNX ({@link FastEmbedEmbedder}, the `fastembed` peer) → dependency-free lexical
 * hashing ({@link LocalEmbedder}). An import failure (peer absent) or a model-fetch failure
 * (air-gapped first run) falls through to hashing, with a one-time process warning that says why,
 * so this never throws and never makes an unavoidable network call.
 */
export async function buildLocalEmbedder(
  opts: { modelName?: string; cacheDir?: string; hashingDimensions?: number } = {},
): Promise<Embedder> {
  try {
    return await FastEmbedEmbedder.create(opts);
  } catch (error) {
    warnLexicalFallback(error);
    return new LocalEmbedder(opts.hashingDimensions ?? 256);
  }
}

/** FNV-1a 32-bit hash, returned as a non-negative integer. */
function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    // 32-bit FNV prime multiply via shifts, kept in uint32.
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Cosine similarity of two equal-length vectors (assumes finite numbers). */
export function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    dot += av * bv;
    na += av * av;
    nb += bv * bv;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
