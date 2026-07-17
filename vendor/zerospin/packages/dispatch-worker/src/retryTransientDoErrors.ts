import type { IAnyError } from '@zerospin/error';
import { Effect, Schedule } from 'effect';

export const isTransientDoError = (error: IAnyError): boolean =>
  error.message.includes('Durable Object reset because its code was updated') ||
  error.message.includes('Durable Object Namespace was deleted') ||
  error.cause?.includes('Durable Object reset because its code was updated') ===
    true ||
  error.cause?.includes('Durable Object Namespace was deleted') === true;

/**
 * Retries the transient failures a SystemWorker DO stub throws while its code
 * is being redeployed. Mirrors the inline retry previously duplicated across
 * every SystemApi/FrontendApi method.
 */
export const retryTransientDoErrors = <A, E extends IAnyError, R>(
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> =>
  effect.pipe(
    Effect.retry({
      times: 5,
      schedule: Schedule.exponential(250, 2),
      while: isTransientDoError,
    }),
  );
