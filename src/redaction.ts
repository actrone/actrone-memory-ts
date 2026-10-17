/**
 * Redaction on read: mask memories by sensitivity before their text reaches a model.
 *
 * The library never detects personal data itself. A memory's `sensitivity` comes from the
 * fact extractor or from what you pass to `injectMemory()`, and this module acts only on that
 * tag. Raw conversation turns carry no tag, so they are never redacted.
 */

import { ValidationError } from "./errors.js";
import { type MemoryEntry, SENSITIVITIES, type Sensitivity } from "./models.js";
import type { TokenCounter } from "./tokens.js";

/** Options for a read that returns memory content (`retrieveContext`, `searchMemories`). */
export interface ReadOptions {
  /**
   * Sensitivity classes to mask in the returned memories, such as `["pii", "sensitive"]`: each
   * matching memory's content becomes `"[redacted: <class>]"`. Omitted uses the manager's
   * `redactSensitivities` config; an empty array masks nothing for this call.
   */
  readonly redact?: readonly Sensitivity[];
}

/** The placeholder that replaces a redacted memory's content, for example `"[redacted: pii]"`. */
export function redactedContent(sensitivity: Sensitivity): string {
  return `[redacted: ${sensitivity}]`;
}

/**
 * Validate the sensitivity classes to redact and return them as a set.
 *
 * @throws {ValidationError} When `classes` is a single string or names an unknown class.
 */
export function resolveRedaction(classes: readonly string[]): ReadonlySet<Sensitivity> {
  if (typeof classes === "string") {
    throw new ValidationError(
      "redact",
      "pass an array of sensitivity classes, such as ['pii', 'sensitive']",
    );
  }
  const resolved = new Set<Sensitivity>();
  for (const value of classes) {
    if (!isSensitivity(value)) {
      throw new ValidationError(
        "redact",
        `unknown sensitivity '${value}'; expected one of ${SENSITIVITIES.join(", ")}`,
      );
    }
    resolved.add(value);
  }
  return resolved;
}

/**
 * Return `entries` with every memory whose sensitivity is in `classes` masked.
 *
 * A masked memory keeps its id, sensitivity, source and position in the ranking. Its content
 * becomes the placeholder, its embedding is dropped because a vector can leak the text it
 * encodes, and its token count is recounted so budget pruning sees the size actually sent. The
 * stored memory is not changed. O(n) in the number of entries.
 *
 * @returns A new array, or `entries` itself when `classes` is empty.
 */
export function redactMemories(
  entries: MemoryEntry[],
  classes: ReadonlySet<Sensitivity>,
  countTokens: TokenCounter,
): MemoryEntry[] {
  if (classes.size === 0) return entries;
  return entries.map((entry) => {
    if (!classes.has(entry.sensitivity)) return entry;
    const placeholder = redactedContent(entry.sensitivity);
    const { embedding: _vector, ...rest } = entry;
    return { ...rest, content: placeholder, tokenCount: countTokens(placeholder) };
  });
}

function isSensitivity(value: string): value is Sensitivity {
  return (SENSITIVITIES as readonly string[]).includes(value);
}
