import { mapParseError, ZerospinError, type IAnyError } from '@zerospin/error';
import { makeEffectSchema } from '@zerospin/schema';
import { Effect, Schema } from 'effect';

import type { InferCommandPayload } from '../models/types.ts';

import { adaptPayload } from './adaptPayload.ts';
import type { IContract } from './types.ts';

export function decodePayload<CONTRACT extends IContract>(
  contract: CONTRACT,
  props: {
    command: {
      readonly commandName: string;
      readonly contractVersion: string;
      readonly id: string;
      readonly payload: string;
    };
  },
): Effect.Effect<InferCommandPayload<CONTRACT['payload']>, IAnyError>;
export function decodePayload(
  contract: IContract,
  props: {
    command: {
      readonly commandName: string;
      readonly contractVersion: string;
      readonly id: string;
      readonly payload: string;
    };
  },
) {
  return Effect.fn('contracts.decodePayload')(function* () {
    const { commandName, version } = contract;
    const payloadSchema = makeEffectSchema(contract.payload);
    const payloadJsonSchema = Schema.fromJsonString(payloadSchema);
    const { command } = props;

    if (command.commandName !== commandName) {
      return yield* new ZerospinError({
        code: 'contract-command-name-mismatch',
        message: `Contract "${commandName}" cannot decode command "${command.commandName}"`,
        extra: {
          commandId: command.id,
          commandName: command.commandName,
          contractName: commandName,
        },
      });
    }

    if (command.contractVersion !== version) {
      let source: IContract | undefined = contract.previous;
      while (
        source !== undefined &&
        source.version !== command.contractVersion
      ) {
        source = source.previous;
      }
      let adapter: IContract = contract;
      if (source === undefined) {
        source = contract.next;
        while (
          source !== undefined &&
          source.version !== command.contractVersion
        ) {
          source = source.next;
        }
        if (source !== undefined) adapter = source;
      }
      if (source !== undefined) {
        const sourcePayload = yield* decodePayload(source, props);
        return yield* adaptPayload(adapter, {
          fromVersion: source.version,
          toVersion: version,
          payload: sourcePayload,
        });
      }
      return yield* new ZerospinError({
        code: 'contract-payload-version-unsupported',
        message: `Contract "${commandName}" does not support payload version "${command.contractVersion}"`,
        extra: {
          commandId: command.id,
          commandName,
          currentVersion: version,
          sourceVersion: command.contractVersion,
        },
      });
    }

    return yield* Schema.decodeEffect(payloadJsonSchema)(command.payload, {
      onExcessProperty: 'error',
    }).pipe(
      mapParseError({
        code: 'decode-command-payload-failed',
        extra: {
          commandId: command.id,
          commandName,
          sourceVersion: command.contractVersion,
        },
        prefix: `Failed to decode payload for command "${commandName}" at version "${command.contractVersion}"`,
      }),
    );
  })();
}
