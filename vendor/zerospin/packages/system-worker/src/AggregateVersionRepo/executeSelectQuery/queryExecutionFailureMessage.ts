/*
 * System-worker annotation:
 * Implements the utils query Execution Failure Message operation.
 * Keep the domain effect named after the operation and leave async Promise glue at the Durable Object boundary.
 */

/**
 * Produces a short string for `ZerospinError.message` from a thrown SQL/runtime
 * `cause` so RPC clients see the underlying driver/SQLite failure, not a generic
 * wrapper-only message.
 */
/*
 * SQL execution failures use this formatter to expose the underlying message
 * in their domain error. It accepts thrown Errors, strings, and other causes
 * without assuming every failure is an Error instance.
 *
 * 1. Prefer a nonempty Error message.
 * 2. Preserve thrown strings.
 * 3. Read a message from other object causes.
 * 4. Serialize other causes as JSON.
 * 5. Fall back when JSON serialization throws.
 */
export function queryExecutionFailureMessage(cause: unknown): string {
  // 1 — return cause.message without serializing the stack
  if (cause instanceof Error && cause.message.length > 0) {
    return cause.message;
  }

  // 2 — return a string cause verbatim
  if (typeof cause === 'string') {
    return cause;
  }

  // 3 — accept only a nonempty string message
  if (typeof cause === 'object' && cause !== null) {
    const maybe = cause as { message?: unknown };
    if (typeof maybe.message === 'string' && maybe.message.length > 0) {
      return maybe.message;
    }
  }

  // 4 — use JSON.stringify when no usable message exists
  try {
    return JSON.stringify(cause);
  } catch {
    // 5 — convert the original cause with String
    return String(cause);
  }
}
