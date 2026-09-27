import { makeZerospinError } from '@zerospin/error';
import { isEqual } from 'es-toolkit';

/** Direct sessions may restore only the claims captured for their current lifetime. */
export function assertSessionClaims(expected: unknown, actual: unknown): void {
  if (expected !== undefined && !isEqual(expected, actual)) {
    throw makeZerospinError({
      code: 'session-claims-mismatch',
      message: 'The supplied claims do not match the session claims',
    });
  }
}
