import { mapParseError, ZerospinError, type IAnyError } from '@zerospin/error';
/* oxlint-disable typescript/no-explicit-any -- Erased contract payloads retain the existing runtime-validation boundary. */
import { makeEffectSchema, type IAnyShape } from '@zerospin/schema';
import { Effect, Schema } from 'effect';

import type { InferCommandPayload } from '../models/types.ts';

import type { IContract } from './types.ts';

export function encodePayload<CONTRACT extends IContract>(
  contract: CONTRACT,
  props: {
    version: NoInfer<CONTRACT['version']>;
    payload: IAnyShape extends CONTRACT['payload']
      ? any
      : InferCommandPayload<NoInfer<CONTRACT['payload']>>;
  },
): Effect.Effect<string, IAnyError>;
export function encodePayload<
  CONTRACT extends IContract,
  SOURCE_VERSION extends keyof NonNullable<CONTRACT['__payloads']> & string,
>(
  contract: CONTRACT,
  props: {
    version: SOURCE_VERSION;
    payload: IAnyShape extends NonNullable<
      CONTRACT['__payloads']
    >[SOURCE_VERSION]
      ? any
      : InferCommandPayload<
          NoInfer<NonNullable<CONTRACT['__payloads']>[SOURCE_VERSION]>
        >;
  },
): Effect.Effect<string, IAnyError>;
export function encodePayload(
  contract: IContract,
  props: { version: string; payload: Record<string, unknown> },
) {
  return Effect.fn('contracts.encodePayload')(function* () {
    const { commandName, version } = contract;
    const payloadSchema = makeEffectSchema(contract.payload);
    const payloadJsonSchema = Schema.fromJsonString(payloadSchema);
    const { payload, version: sourceVersion } = props;
    if (sourceVersion !== version) {
      const parent = contract.previous;
      if (parent !== undefined) {
        return yield* encodePayload(parent, props);
      }
      return yield* new ZerospinError({
        code: 'contract-payload-version-unsupported',
        message: `Contract "${commandName}" does not support payload version "${sourceVersion}"`,
        extra: {
          commandName,
          currentVersion: version,
          sourceVersion,
        },
      });
    }
    return yield* Schema.encodeEffect(payloadJsonSchema)(payload, {
      onExcessProperty: 'error',
    }).pipe(
      mapParseError({
        code: 'encode-command-payload-failed',
        prefix: `Failed to encode payload for command "${commandName}" at version "${sourceVersion}"`,
        extra: { commandName, sourceVersion },
      }),
    );
  })();
}
