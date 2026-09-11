import { mapParseError, ZerospinError, type IAnyError } from '@zerospin/error';
/* oxlint-disable typescript/no-explicit-any -- Erased contract payloads retain the existing runtime-validation boundary. */
import { makeEffectSchema, type IAnyShape } from '@zerospin/schema';
import { Effect, Schema } from 'effect';

import type { InferCommandPayload } from '../models/types.ts';

import type { IContract } from './types.ts';

export function adaptPayload<
  CONTRACT extends IContract,
  FROM extends keyof NonNullable<CONTRACT['__payloads']> & string,
  TO extends keyof NonNullable<CONTRACT['__payloads']> & string,
>(
  contract: CONTRACT,
  props: {
    fromVersion: FROM;
    toVersion: TO;
    payload: IAnyShape extends NonNullable<CONTRACT['__payloads']>[FROM]
      ? any
      : InferCommandPayload<NoInfer<NonNullable<CONTRACT['__payloads']>[FROM]>>;
  },
): Effect.Effect<
  IAnyShape extends NonNullable<CONTRACT['__payloads']>[TO]
    ? any
    : InferCommandPayload<NonNullable<CONTRACT['__payloads']>[TO]>,
  IAnyError
>;
export function adaptPayload(
  contract: IContract,
  props: { fromVersion: string; toVersion: string; payload: unknown },
) {
  return Effect.fn('contracts.adaptPayload')(function* () {
    const { commandName } = contract;
    const lineage: IContract[] = [];
    let ancestor: IContract | undefined = contract;
    while (ancestor !== undefined) {
      lineage.push(ancestor);
      ancestor = ancestor.previous;
    }
    let index = lineage.findIndex(item => item.version === props.fromVersion);
    const targetIndex = lineage.findIndex(
      item => item.version === props.toVersion,
    );
    const source = lineage[index];
    if (source === undefined || targetIndex === -1) {
      return yield* new ZerospinError({
        code: 'contract-payload-version-unsupported',
        message: `Unknown adaptation version for ${commandName}`,
        extra: { fromVersion: props.fromVersion, toVersion: props.toVersion },
      });
    }
    let adapted = yield* Schema.decodeUnknownEffect(
      Schema.toType(makeEffectSchema(source.payload)),
    )(props.payload, { onExcessProperty: 'error' }).pipe(
      mapParseError({
        code: 'validate-command-payload-failed',
        prefix: `Invalid source payload for ${commandName}@${source.version}`,
      }),
    );
    while (index !== targetIndex) {
      const upward = index > targetIndex;
      const nextIndex = upward ? index - 1 : index + 1;
      const child = lineage[upward ? nextIndex : index];
      const destination = lineage[nextIndex];
      const adapter = upward ? child?.up : child?.down;
      if (adapter === undefined || destination === undefined) {
        return yield* new ZerospinError({
          code: 'contract-payload-adapter-missing',
          message: `Missing ${upward ? 'up' : 'down'} adapter for ${commandName}`,
          extra: {
            fromVersion: props.fromVersion,
            toVersion: props.toVersion,
          },
        });
      }
      const result = yield* Effect.suspend(() =>
        adapter({ payload: adapted }),
      ).pipe(
        Effect.catchCause(
          cause =>
            new ZerospinError({
              code: 'contract-payload-adapter-failed',
              message: `Payload adapter to ${commandName}@${destination.version} failed`,
              cause: ZerospinError.prettyUnknownFailure(cause),
            }),
        ),
      );
      adapted = yield* Schema.decodeUnknownEffect(
        Schema.toType(makeEffectSchema(destination.payload)),
      )(result, { onExcessProperty: 'error' }).pipe(
        mapParseError({
          code: 'contract-payload-adapter-output-invalid',
          prefix: `Invalid adapter output for ${commandName}@${destination.version}`,
        }),
      );
      index = nextIndex;
    }
    return adapted;
  })();
}
