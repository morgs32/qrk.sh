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
export function queryExecutionFailureMessage(cause: unknown): string {
  if (cause instanceof Error && cause.message.length > 0) {
    return cause.message;
  }
  if (typeof cause === 'string') {
    return cause;
  }
  if (typeof cause === 'object' && cause !== null) {
    const maybe = cause as { message?: unknown };
    if (typeof maybe.message === 'string' && maybe.message.length > 0) {
      return maybe.message;
    }
  }
  try {
    return JSON.stringify(cause);
  } catch {
    return String(cause);
  }
}
