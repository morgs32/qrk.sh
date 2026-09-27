import { makeZerospinError } from '@zerospin/error';
import { isEqual } from 'es-toolkit';

/** Direct sessions may restore only the identity captured for their current lifetime. */
export function assertSessionIdentity(
  expected: unknown,
  actual: unknown,
): void {
  if (expected !== undefined && !isEqual(expected, actual)) {
    throw makeZerospinError({
      code: 'session-identity-mismatch',
      message: 'The supplied identity does not match the session identity',
    });
  }
}
