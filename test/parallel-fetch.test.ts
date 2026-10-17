import { describe, expect, it } from "vitest";

import {
  InMemoryStore,
  type L2SearchParams,
  type MemoryEntry,
  MemoryManager,
  type Turn,
} from "../src/index.js";

/** Resolves once `signal` fires, or rejects after `ms` so a regression fails instead of hanging. */
function waitFor(signal: Promise<void>, ms: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("the other tier's read never started")), ms);
  });
  return Promise.race([signal, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Once armed, each tier's read waits until the other tier's read has started. A sequential
 * fetch can never satisfy both waits and times out; a concurrent fetch meets in the middle
 * straight away. The timeout only bounds a regression, it is not a synchronisation sleep.
 */
class RendezvousStore extends InMemoryStore {
  armed = false;
  l1Started = false;
  l2Started = false;
  private readonly l1Signal: Promise<void>;
  private readonly l2Signal: Promise<void>;
  private markL1!: () => void;
  private markL2!: () => void;

  constructor() {
    super();
    this.l1Signal = new Promise((resolve) => {
      this.markL1 = resolve;
    });
    this.l2Signal = new Promise((resolve) => {
      this.markL2 = resolve;
    });
  }

  override async getRecentTurns(agentId: string, sessionId: string, n?: number): Promise<Turn[]> {
    if (this.armed) {
      this.l1Started = true;
      this.markL1();
      await waitFor(this.l2Signal, 2000);
    }
    return super.getRecentTurns(agentId, sessionId, n);
  }

  override async search(params: L2SearchParams): Promise<MemoryEntry[]> {
    if (this.armed) {
      this.l2Started = true;
      this.markL2();
      await waitFor(this.l1Signal, 2000);
    }
    return super.search(params);
  }
}

describe("retrieveContext parallel fetch", () => {
  it("reads L1 while L2 embeds and searches, so it waits for the slower side only", async () => {
    const store = new RendezvousStore();
    const mm = await MemoryManager.create({
      l1: store,
      l2: store,
      config: { relevanceThreshold: 0.01 },
    });
    await mm.storeTurn("a1", "s1", "hello", "hi");

    store.armed = true;
    const ctx = await mm.retrieveContext("a1", "s1", "hello", 1000);

    expect(store.l1Started && store.l2Started).toBe(true);
    expect(ctx.recentTurns).toHaveLength(1);
    await mm.close();
  });
});
