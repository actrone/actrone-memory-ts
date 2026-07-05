/**
 * Structured error hierarchy for `@actrone/memory`, mirroring the Python
 * `actrone_memory.exceptions` contract so cross-language docs and behaviour
 * line up. Every error carries a machine-readable {@link MemoryError.code}.
 */

/** Base class for every error thrown by the library. */
export class MemoryError extends Error {
  /** Machine-readable error class. */
  readonly code: string;
  /** Structured contextual fields. */
  readonly details: Readonly<Record<string, unknown>>;

  constructor(message: string, code: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.details = details;
    // Restore the prototype chain for instanceof across transpile targets.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** An input argument failed length/format/range validation at the boundary. */
export class ValidationError extends MemoryError {
  constructor(field: string, reason: string) {
    super(`${field} ${reason}`, "ERR_VALIDATION", { field, reason });
  }
}

/** The requested token budget was 0 or negative. */
export class TokenBudgetError extends MemoryError {
  constructor(message: string, details: Record<string, unknown> = {}) {
    super(message, "ERR_TOKEN_BUDGET", details);
  }
}

/** Required configuration was missing or invalid. */
export class ConfigurationError extends MemoryError {
  constructor(message: string, details: Record<string, unknown> = {}) {
    super(message, "ERR_CONFIGURATION", details);
  }
}

/** A memory id was not found in the long-term store. */
export class MemoryNotFoundError extends MemoryError {
  constructor(memoryId: string) {
    super(`memory not found: ${memoryId}`, "ERR_MEMORY_NOT_FOUND", { memoryId });
  }
}

/** A backing store (L1/L2) could not be reached. */
export class StoreConnectionError extends MemoryError {
  constructor(message: string, details: Record<string, unknown> = {}) {
    super(message, "ERR_STORE_CONNECTION", details);
  }
}
