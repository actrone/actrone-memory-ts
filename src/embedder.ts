/**
 * Embedding seam. The default {@link LocalEmbedder} is dependency-free and
 * deterministic: it hashes words into a fixed-dimension bag-of-words vector and
 * L2-normalises it, so cosine similarity reflects word overlap. That is enough
 * for the self-hosted on-ramp and makes the whole test suite run offline.
 *
 * For production semantic quality, pass an {@link Embedder} backed by a real
 * model (e.g. OpenAI `text-embedding-3-small`) when constructing a MemoryManager.
 */
export interface Embedder {
  /** The dimensionality of vectors this embedder produces. */
  readonly dimensions: number;
  /** Embed a single text into a dense vector. */
  embed(text: string): Promise<number[]>;
}

/** Deterministic, dependency-free hashing embedder (a "hashing vectorizer"). */
export class LocalEmbedder implements Embedder {
  readonly dimensions: number;

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

/**
 * In-process ONNX dense embedder via `fastembed` (fastembed-js, onnxruntime — no torch/GPU). The
 * preferred "real" recall tier (Axis A1): local-first, zero-egress after a one-time model download,
 * no API key. Default model `bge-small-en-v1.5` (384-dim). `fastembed` is an optional peer — install
 * it (`npm i fastembed`) to enable dense recall; without it {@link buildLocalEmbedder} degrades to
 * the dependency-free hashing embedder.
 */
export class FastEmbedEmbedder implements Embedder {
  readonly dimensions: number;
  readonly #model: { queryEmbed(text: string): Promise<number[]> };

  private constructor(model: { queryEmbed(text: string): Promise<number[]> }, dimensions: number) {
    this.#model = model;
    this.dimensions = dimensions;
  }

  /** Load the model (downloads + caches on first call), resolving its dimension by a probe embed. */
  static async create(opts: { modelName?: string; cacheDir?: string } = {}): Promise<FastEmbedEmbedder> {
    // Variable specifier so tsc does not statically resolve the optional peer at build time.
    const pkg = "fastembed";
    const mod = (await import(pkg)) as {
      FlagEmbedding: {
        init(o: { model?: string; cacheDir?: string }): Promise<{
          queryEmbed(text: string): Promise<number[]>;
        }>;
      };
      EmbeddingModel: Record<string, string>;
    };
    const model = await mod.FlagEmbedding.init({
      model: opts.modelName ?? mod.EmbeddingModel["BGESmallEN"] ?? "BGESmallEN",
      ...(opts.cacheDir !== undefined ? { cacheDir: opts.cacheDir } : {}),
    });
    const probe = await model.queryEmbed("probe");
    return new FastEmbedEmbedder(model, probe.length);
  }

  async embed(text: string): Promise<number[]> {
    return this.#model.queryEmbed(text);
  }
}

/**
 * Return the best available local, offline, zero-egress embedder, degrading gracefully (Axis A2):
 * in-process ONNX ({@link FastEmbedEmbedder}, the `fastembed` peer) → dependency-free hashing
 * ({@link LocalEmbedder}). An import failure (peer absent) or a model-fetch failure (air-gapped
 * first run) falls through to hashing, so this never throws and never makes an unavoidable network
 * call — the model download is one-time and the hashing tier needs none.
 */
export async function buildLocalEmbedder(
  opts: { modelName?: string; cacheDir?: string; hashingDimensions?: number } = {},
): Promise<Embedder> {
  try {
    return await FastEmbedEmbedder.create(opts);
  } catch {
    // fastembed peer absent or the model could not be fetched — fall back to lexical hashing.
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
