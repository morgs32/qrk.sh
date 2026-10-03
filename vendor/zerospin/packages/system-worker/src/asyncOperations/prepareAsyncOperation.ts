import { encodePayload } from '@zerospin/core/contracts/encodePayload';
import type { IAsyncOperation } from '@zerospin/core/contracts/make/mapContractVersion';
import type { IContract } from '@zerospin/core/contracts/types';
import { runProgram } from '@zerospin/core/execution/runProgram';
import { NanoIdFactory } from '@zerospin/core/utils/NanoIdFactory';
import { makeZerospinError, mapParseError } from '@zerospin/error';
import { makeIdFromAbbreviation } from '@zerospin/schema';
import { Effect, Schema } from 'effect';

import { asyncOperationLifecycleCodec } from './asyncOperationsDbConfig.js';

/** Immutable emission and original authority share the command's transaction. */
export const prepareAsyncOperation = Effect.fn('prepareAsyncOperation')(
  function* (props: {
    operation: IAsyncOperation;
    commandId: string;
    operationIndex: number;
    committedAt: Date;
    original: boolean;
    actor:
      | {
          name: string;
          version: string;
          contracts: Readonly<Record<string, IContract>>;
        }
      | undefined;
    claims: Readonly<Record<string, unknown>> | null;
  }) {
    const { operation, actor } = props;
    if (props.original && props.claims === null) {
      return yield* makeZerospinError('async-production-authority-missing');
    }
    if (
      operation.contract.async === undefined ||
      actor?.contracts[operation.contract.commandName] !== operation.contract
    ) {
      return yield* makeZerospinError('async-emission-unregistered');
    }
    const encodedPayload = yield* runProgram(
      encodePayload(operation.contract, {
        version: operation.contract.version,
        payload: operation.payload,
      }),
    );
    const payload = yield* Schema.decodeUnknownEffect(
      Schema.fromJsonString(Schema.Json),
    )(encodedPayload).pipe(
      mapParseError({
        code: 'async-payload-json-invalid',
        prefix: 'Async payload must encode as JSON',
      }),
    );
    return yield* Schema.encodeEffect(asyncOperationLifecycleCodec)({
      commandId: props.commandId,
      operationIndex: props.operationIndex,
      asyncContractName: operation.contract.commandName,
      asyncContractVersion: operation.contract.version,
      payload,
      committedAt: props.committedAt,
      asyncCommandId: props.original
        ? yield* makeIdFromAbbreviation({ abbreviation: 'cmd' }).pipe(
            Effect.provide(NanoIdFactory),
          )
        : null,
      actorName: props.original ? actor.name : null,
      actorVersion: props.original ? actor.version : null,
      claims: props.original ? props.claims : null,
      external: null,
      externalRecordedAt: null,
      nextRunAt: props.original ? props.committedAt : null,
      lastProducerFailure: null,
    }).pipe(
      mapParseError({
        code: 'async-operation-invalid',
        prefix: 'Invalid retained async emission',
      }),
    );
  },
);
