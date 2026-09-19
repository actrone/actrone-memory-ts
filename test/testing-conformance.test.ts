import { describe, expect, it } from "vitest";

import type { MemoryEntry, Turn } from "../src/models.js";
import { InMemoryStore, type L2SearchParams } from "../src/store.js";
import { checkL1Store, checkL2Store, ConformanceError } from "../src/testing.js";

/**
 * Two jobs here. First, prove the built-in `InMemoryStore` satisfies the contract we ask
 * third-party adapters to satisfy, so the suite is not holding others to a standard we fail.
 * Second, prove the suite actually *detects* violations: a conformance suite that passes
 * everything is worse than none, because it manufactures false confidence.
 */
const DIMENSIONS = 8;

describe("published conformance suite", () => {
  it("InMemoryStore satisfies the L1 contract", async () => {
    await checkL1Store(() => new InMemoryStore());
  });

  it("InMemoryStore satisfies the L2 contract", async () => {
    await checkL2Store(() => new InMemoryStore(), { dimensions: DIMENSIONS });
  });

  it("accepts an async factory", async () => {
    await checkL1Store(async () => new InMemoryStore());
  });

  it("rejects too few dimensions", async () => {
    await expect(
      checkL2Store(() => new InMemoryStore(), { dimensions: 1 }),
    ).rejects.toThrow(/at least 2/);
  });
});

describe("the suite detects real L1 violations", () => {
  it("catches newest-first ordering", async () => {
    class ReversedOrder extends InMemoryStore {
      override async getRecentTurns(a: string, s: string, n?: number): Promise<Turn[]> {
        return (await super.getRecentTurns(a, s, n)).reverse();
      }
    }
    await expect(checkL1Store(() => new ReversedOrder())).rejects.toThrow(ConformanceError);
    await expect(checkL1Store(() => new ReversedOrder())).rejects.toThrow(/ordering/);
  });

  it("catches an n that windows from the start", async () => {
    class FirstNInsteadOfLast extends InMemoryStore {
      override async getRecentTurns(a: string, s: string, n?: number): Promise<Turn[]> {
        const all = await super.getRecentTurns(a, s);
        return n === undefined ? all : all.slice(0, n);
      }
    }
    await expect(checkL1Store(() => new FirstNInsteadOfLast())).rejects.toThrow(/windowing/);
  });

  it("catches cross-agent leakage in the hot tier", async () => {
    class Leaky extends InMemoryStore {
      override async getRecentTurns(_a: string, s: string, n?: number): Promise<Turn[]> {
        const merged: Turn[] = [];
        for (const agent of ["agent-a", "agent-b"]) {
          merged.push(...(await super.getRecentTurns(agent, s)));
        }
        return n === undefined ? merged : merged.slice(-n);
      }
    }
    await expect(checkL1Store(() => new Leaky())).rejects.toThrow(/agent isolation/);
  });

  it("catches an unscoped clearSession", async () => {
    class Unscoped extends InMemoryStore {
      override async clearSession(agentId: string, _sessionId: string): Promise<void> {
        for (const session of ["s1", "s2"]) {
          await super.clearSession(agentId, session);
        }
      }
    }
    await expect(checkL1Store(() => new Unscoped())).rejects.toThrow(/clearSession scope/);
  });

  it("catches metadata that invents a missing session", async () => {
    class AlwaysMeta extends InMemoryStore {
      override async getSessionMetadata(agentId: string, sessionId: string) {
        return { agentId, sessionId, turnCount: 3 };
      }
    }
    await expect(checkL1Store(() => new AlwaysMeta())).rejects.toThrow(/unknown session/);
  });
});

describe("the suite detects real L2 violations", () => {
  it("catches cross-agent leakage in the long-term tier", async () => {
    class Leaky extends InMemoryStore {
      override async search(params: L2SearchParams): Promise<MemoryEntry[]> {
        const all: MemoryEntry[] = [];
        for (const agent of ["agent-a", "agent-b"]) {
          all.push(...(await super.search({ ...params, agentId: agent })));
        }
        return all.slice(0, params.limit);
      }
    }
    await expect(
      checkL2Store(() => new Leaky(), { dimensions: DIMENSIONS }),
    ).rejects.toThrow(/agent isolation/);
  });

  it("catches a threshold that is ignored", async () => {
    class IgnoresThreshold extends InMemoryStore {
      override async search(params: L2SearchParams): Promise<MemoryEntry[]> {
        return super.search({ ...params, threshold: 0 });
      }
    }
    await expect(
      checkL2Store(() => new IgnoresThreshold(), { dimensions: DIMENSIONS }),
    ).rejects.toThrow(/threshold/);
  });

  it("catches an upsert that appends instead of replacing", async () => {
    class Appends extends InMemoryStore {
      override async upsert(entry: MemoryEntry): Promise<void> {
        const buckets = (this as unknown as { memories: Map<string, MemoryEntry[]> }).memories;
        const bucket = buckets.get(entry.agentId) ?? [];
        bucket.push(entry); // never replaces an existing id
        buckets.set(entry.agentId, bucket);
      }
    }

    // The store is rejected, but not by the idempotency check: `hybridRank` keys candidates
    // by id, so duplicates collapse before search returns them. The duplication surfaces one
    // requirement later instead, when delete-by-id removes only one copy and the "deleted"
    // memory is still findable. Asserting the specific message here would be asserting an
    // implementation detail of the ranking layer.
    await expect(
      checkL2Store(() => new Appends(), { dimensions: DIMENSIONS }),
    ).rejects.toThrow(ConformanceError);
  });

  it("catches a deleteAgentMemories that erases everything", async () => {
    class ErasesAll extends InMemoryStore {
      override async deleteAgentMemories(_agentId: string): Promise<void> {
        await super.deleteAgentMemories("agent-a");
        await super.deleteAgentMemories("agent-b");
      }
    }
    await expect(
      checkL2Store(() => new ErasesAll(), { dimensions: DIMENSIONS }),
    ).rejects.toThrow(/deleteAgentMemories scope/);
  });
});
