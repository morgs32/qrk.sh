import { defineCommand } from '@zerospin/core/contracts/Command';
import { makeContractVersion } from '@zerospin/core/contracts/makeVersion';
import { Effect } from 'effect';

/**
 * Payload-only contracts omit `program`; factory supplies no-op `{}`.
 *
 * @bad Dummy `program: () => Effect.gen(function* () { yield* Effect.void })`.
 */
export const pingContract = makeContractVersion(defineCommand('ping'), {
  payloadSchema: PingPayloadSchema,
});

declare const PingPayloadSchema: unknown;

declare const makeContractWithDefaultProgram: typeof makeContractVersion;

export const internalDefault = Effect.succeed({});
