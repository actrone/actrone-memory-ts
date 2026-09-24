/**
 * Use case: a customer support agent (actrone.com/use-cases/customer-support).
 *
 * CI type-checks this file against the current source, and `test/use-cases.test.ts` runs it and
 * asserts what the page claims: customers stay apart, personal data stays out of the prompt, and
 * one call erases a customer. The `#region` block is what the page shows.
 */
// #region memory-ts-use-case-support
import { MemoryManager } from "actrone-memory";

// Long-term memory is scoped by its first argument, so one scope per customer keeps them apart.
const scopeFor = (customerId: string) => `customer:${customerId}`;

// Seed what your CRM already knows, tagged with its source and how sensitive it is.
export async function importAccount(memory: MemoryManager, customerId: string): Promise<void> {
  const scope = scopeFor(customerId);
  // Arguments: scope, fact, importance, session label, topic tags, source, sensitivity.
  await memory.injectMemory(scope, "The customer is on the Business plan and renews in March.",
    0.9, "crm", ["plan"], "import:crm", "none");
  await memory.injectMemory(scope, "The customer billing email is dana@example.com.",
    0.6, "crm", ["contact"], "import:crm", "pii");
}

// Answer a ticket with what you know about this customer, minus personal data.
export async function answerTicket(
  memory: MemoryManager,
  customerId: string,
  ticketId: string,
  question: string,
  callModel: (question: string, facts: string[]) => Promise<string>,
): Promise<string> {
  const scope = scopeFor(customerId);
  const context = await memory.retrieveContext(scope, ticketId, question, 2000);
  const facts = context.episodicMemories
    .filter((m) => m.sensitivity === "none" || m.sensitivity === "low")
    .map((m) => m.content);
  const reply = await callModel(question, facts);
  await memory.storeTurn(scope, ticketId, question, reply);
  return reply;
}

// A deletion request: erase the customer's memories and this ticket's turns.
export async function forgetCustomer(memory: MemoryManager, customerId: string, ticketId: string) {
  await memory.eraseAgentMemories(scopeFor(customerId), ticketId);
}
// #endregion memory-ts-use-case-support
