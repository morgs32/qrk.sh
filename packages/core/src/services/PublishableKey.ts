import { Context } from 'effect';
import type { Redacted } from 'effect/Redacted';

/**
 * Client publishable key (e.g. Clerk pk_*) for Zerospin public HTTP RPC.
 * Service value is `Redacted` so it does not show raw strings in logs or traces by default.
 */
export class PublishableKey extends Context.Tag('PublishableKey')<
  PublishableKey,
  Redacted<string>
>() {}
