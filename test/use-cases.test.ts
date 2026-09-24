/**
 * Runs the use-case examples (examples/use-cases/) and asserts every behaviour their pages on
 * actrone.com claim. The pages render the examples' `#region` blocks verbatim, so a claim that stops
 * being true fails here before it can be published.
 *
 * Runs with the default keyword embedder (test/setup.ts pins fastembed as absent), so every query
 * below shares real words with the fact it should recall.
 */
import { describe, expect, it } from "vitest";

import { MemoryManager } from "../src/index.js";
import { endConversation, recallFor, recordTurn, rememberAboutUser } from "../examples/use-cases/assistant.js";
import { conventionsFor, learnConvention, recordExchange } from "../examples/use-cases/coding.js";
import { answerTicket, forgetCustomer, importAccount } from "../examples/use-cases/support.js";

/** A model stand-in that records the facts it was given. */
function recordingModel(reply = "Thanks, that is sorted.") {
  const calls: string[][] = [];
  const callModel = async (_question: string, facts: string[]) => {
    calls.push(facts);
    return reply;
  };
  return { calls, callModel };
}

describe("use case: customer support", () => {
  it("answers from the customer's own facts and keeps personal data out of the prompt", async () => {
    const memory = await MemoryManager.create();
    await importAccount(memory, "c-1");
    const model = recordingModel("You are on the Business plan.");

    await answerTicket(memory, "c-1", "t-1", "Which plan is the customer on?", model.callModel);

    const facts = model.calls[0] ?? [];
    expect(facts).toContain("The customer is on the Business plan and renews in March.");
    expect(facts.join(" ")).not.toContain("@");
    expect(await memory.getRecentTurns("customer:c-1", "t-1")).toHaveLength(1);
  });

  it("keeps customers apart", async () => {
    const memory = await MemoryManager.create();
    await importAccount(memory, "c-1");
    const model = recordingModel();

    await answerTicket(memory, "c-2", "t-9", "Which plan is the customer on?", model.callModel);

    expect(model.calls[0]).toEqual([]);
  });

  it("erases a customer's memories and the ticket's turns in one call", async () => {
    const memory = await MemoryManager.create();
    await importAccount(memory, "c-1");
    await answerTicket(memory, "c-1", "t-1", "Which plan is the customer on?", recordingModel().callModel);

    await forgetCustomer(memory, "c-1", "t-1");

    const after = recordingModel();
    await answerTicket(memory, "c-1", "t-2", "Which plan is the customer on?", after.callModel);
    expect(after.calls[0]).toEqual([]);
    expect(await memory.getRecentTurns("customer:c-1", "t-1")).toHaveLength(0);
  });
});

describe("use case: coding assistant", () => {
  const ZOD_RULE = "Route handlers live in src/routes and validate the request body with zod.";

  async function seeded() {
    const memory = await MemoryManager.create();
    await learnConvention(memory, "web", ZOD_RULE);
    await learnConvention(memory, "web", "Run the tests with pnpm vitest, not npm test.");
    await learnConvention(memory, "web", "Dates use date-fns; moment is not allowed.");
    await learnConvention(memory, "billing-service", "Route handlers in this service validate with pydantic.");
    return memory;
  }

  it("recalls the convention that matters for the task, from this repository only", async () => {
    const memory = await seeded();

    const { conventions } = await conventionsFor(
      memory,
      "web",
      "s-1",
      "Add a route handler that validates the request body",
    );

    expect(conventions).toContain(ZOD_RULE);
    expect(conventions.join(" ")).not.toContain("pydantic");
  });

  it("never returns more context than the budget allows", async () => {
    const memory = await seeded();
    for (let i = 0; i < 20; i++) {
      await recordExchange(memory, "web", "s-1", `Request ${i}: tidy the route handlers`, "Done, see the diff.");
    }

    const { tokensUsed } = await conventionsFor(memory, "web", "s-1", "Add a route handler");

    expect(tokensUsed).toBeLessThanOrEqual(800);
  });
});

describe("use case: personal assistant", () => {
  async function seeded() {
    const memory = await MemoryManager.create();
    await rememberAboutUser(memory, "u-1", "Prefers answers in British English without a preamble.");
    await rememberAboutUser(memory, "u-1", "Is allergic to peanuts.", "sensitive");
    return memory;
  }

  it("remembers the user after the conversation that taught it has ended", async () => {
    const memory = await seeded();
    await recordTurn(memory, "u-1", "conv-1", "Book me a table for Friday", "Booked for 7pm.");
    await endConversation(memory, "u-1", "conv-1");

    const { facts, recentTurns } = await recallFor(memory, "u-1", "conv-2", "Write a short note in British English");

    expect(recentTurns).toBe(0);
    expect(facts).toContainEqual({
      content: "Prefers answers in British English without a preamble.",
      sensitivity: "low",
    });
  });

  it("hands every fact back with its sensitivity tag", async () => {
    const memory = await seeded();

    const { facts } = await recallFor(memory, "u-1", "conv-2", "Suggest a dinner place, I am allergic to peanuts");

    expect(facts).toContainEqual({ content: "Is allergic to peanuts.", sensitivity: "sensitive" });
  });

  it("keeps one user's facts away from another", async () => {
    const memory = await seeded();

    const { facts } = await recallFor(memory, "u-2", "conv-1", "Suggest a dinner place, I am allergic to peanuts");

    expect(facts).toEqual([]);
  });
});
