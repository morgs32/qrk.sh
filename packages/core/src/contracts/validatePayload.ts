import { mapParseError, ZerospinError, type IAnyError } from '@zerospin/error';
/* oxlint-disable typescript/no-explicit-any -- Erased contract payloads retain the existing runtime-validation boundary. */
import {
  makeEffectSchema,
  PrimitiveKind,
  type IAnyShape,
} from '@zerospin/schema';
import { Effect, Schema } from 'effect';

import type {
  InferCommandPayload,
  InferPayloadInput,
} from '../models/types.ts';

import type { IContract } from './types.ts';

export function validatePayload<
  PAYLOADS extends Record<string, IAnyShape>,
  SOURCE_VERSION extends keyof PAYLOADS & string,
>(
  contract: IContract<string, IAnyShape, string, unknown, PAYLOADS>,
  props: {
    version: SOURCE_VERSION;
    payload: NoInfer<
      IAnyShape extends PAYLOADS[SOURCE_VERSION]
        ? any
        : InferPayloadInput<PAYLOADS[SOURCE_VERSION]>
    >;
  },
): Effect.Effect<
  IAnyShape extends PAYLOADS[SOURCE_VERSION]
    ? any
    : InferCommandPayload<PAYLOADS[SOURCE_VERSION]>,
  IAnyError
>;
export function validatePayload(
  contract: IContract<
    string,
    IAnyShape,
    string,
    unknown,
    Record<string, IAnyShape>
  >,
  props: { version: string; payload: Record<string, unknown> },
) {
  return Effect.fn('contracts.validatePayload')(function* () {
    const { commandName, version, payload } = contract;
    const payloadSchema = makeEffectSchema(contract.payload);
    const { payload: commandPayload, version: sourceVersion } = props;
    if (sourceVersion !== version) {
      const parent = contract.previous;
      if (parent !== undefined) {
        return yield* validatePayload(parent, props);
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
    const encodedPayload: Record<string, unknown> = { ...commandPayload };
    for (const [key, descriptor] of Object.entries(payload)) {
      if (descriptor.kind !== PrimitiveKind.Json) {
        continue;
      }
      const value = encodedPayload[key];
      if (value === null || value === undefined) {
        continue;
      }
      encodedPayload[key] = yield* Schema.encodeEffect(
        Schema.fromJsonString(descriptor.schema),
      )(value).pipe(
        mapParseError({
          code: 'encode-command-json-payload-field-failed',
          prefix: `Failed to encode JSON payload field "${key}" for command "${commandName}" at version "${sourceVersion}"`,
        }),
      );
    }
    return yield* Schema.decodeUnknownEffect(payloadSchema)(encodedPayload, {
      onExcessProperty: 'error',
    }).pipe(
      mapParseError({
        code: 'validate-command-payload-failed',
        prefix: `Failed to validate payload for command "${commandName}" at version "${sourceVersion}"`,
        extra: { commandName, sourceVersion },
      }),
    );
  })();
}
