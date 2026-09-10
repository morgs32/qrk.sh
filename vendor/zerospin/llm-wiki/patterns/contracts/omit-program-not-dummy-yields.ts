import { contracts } from '@zerospin/core/contracts/index';
import { Effect } from 'effect';

/**
 * Payload-only contracts omit `program`; factory supplies no-op `{}`.
 *
 * @bad Dummy `program: () => Effect.gen(function* () { yield* Effect.void })`.
 */
export const pingContract = contracts.makeVersion(
  contracts.makeCommand('ping'),
  {
    payloadSchema: PingPayloadSchema,
  },
);

declare const PingPayloadSchema: unknown;

declare const makeContractWithDefaultProgram: typeof contracts.makeVersion;

export const internalDefault = Effect.succeed({});
