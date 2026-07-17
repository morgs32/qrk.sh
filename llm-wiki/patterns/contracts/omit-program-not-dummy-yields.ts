import { Effect } from 'effect';

/**
 * Payload-only contracts omit `program`; factory supplies no-op `{}`.
 *
 * @bad Dummy `program: () => Effect.gen(function* () { yield* Effect.void })`.
 */
export const pingContract = makeContract({
  commandName: 'ping',
  payloadSchema: PingPayloadSchema,
});

declare function makeContract(props: {
  commandName: string;
  payloadSchema: unknown;
  program?: never;
}): unknown;
declare const PingPayloadSchema: unknown;

declare const makeContractWithDefaultProgram: typeof makeContract;

export const internalDefault = Effect.succeed({});
