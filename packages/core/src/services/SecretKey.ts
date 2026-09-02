import { Context } from 'effect';
import type { Redacted } from 'effect/Redacted';

/**
 * Zerospin API secret (e.g. `zerospinSecretKey` for `getSystemApi`).
 * Service value is `Redacted` so the raw key is not the default in logs or traces.
 */
export class SecretKey extends Context.Service<SecretKey, Redacted<string>>()(
  'SecretKey',
) {}
