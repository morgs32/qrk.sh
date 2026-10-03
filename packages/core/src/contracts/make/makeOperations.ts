import {
  isZerospinError,
  makeZerospinError,
  mapParseError,
  type IAnyError,
} from '@zerospin/error';
import { Effect, Schema } from 'effect';

import type { IDb } from '../../drizzle/types.ts';
import { runProgram } from '../../execution/runProgram.ts';
import type { IAnyModels } from '../../models/types.ts';
import { assertOperationsUseModels } from '../assertOperationsUseModels.ts';
import { validateAsyncValues } from '../asyncInputCodec.ts';
import { validateFailure } from '../failureCodec.ts';
import { operationSink, type ExcludeOperationSink } from '../operationSink.ts';
import { encodeContractResult } from '../resultCodec.ts';
import { runContractGuard } from '../runContractGuard.ts';
import type {
  ICommand,
  IContract,
  IContractFailure,
  IContractOutput,
  InferContractOperations,
  InferContractResult,
  InferFailure,
} from '../types.ts';
import { validatePayload } from '../validatePayload.ts';
export function makeOperations<CONTRACT extends IContract>(props: {
  db: Readonly<Pick<IDb, 'query'>>;
  contract: CONTRACT;
  models: IAnyModels;
  command: ICommand;
  claims: Readonly<Record<string, unknown>> | null;
}): Effect.Effect<
  Readonly<{
    contractVersion: string;
    payload: unknown;
    operations: readonly InferContractOperations<CONTRACT>[];
    result: InferContractResult<CONTRACT>;
    encodedResult: typeof Schema.Json.Type;
  }>,
  IAnyError | InferFailure<CONTRACT>,
  ExcludeOperationSink<Effect.Services<ReturnType<CONTRACT['program']>>>
>;
export function makeOperations(props: {
  db: Readonly<Pick<IDb, 'query'>>;
  contract: IContract;
  models: IAnyModels;
  command: ICommand;
  claims: Readonly<Record<string, unknown>> | null;
}) {
  return make(props);
}
const make = Effect.fn('makeOperations')(function* (props: {
  db: Readonly<Pick<IDb, 'query'>>;
  contract: IContract;
  models: IAnyModels;
  command: ICommand;
  claims: Readonly<Record<string, unknown>> | null;
}): Effect.fn.Return<
  Readonly<{
    contractVersion: string;
    payload: unknown;
    operations: readonly IContractOutput[];
    result: unknown;
    encodedResult: typeof Schema.Json.Type;
  }>,
  IContractFailure,
  unknown
> {
  const { contract, models, command, claims: inputClaims } = props;
  if (contract.async === undefined && command.asyncInput != null) {
    return yield* makeZerospinError('async-contract-kind-mismatch');
  }
  const asyncValues =
    contract.async === undefined
      ? undefined
      : command.asyncInput == null
        ? yield* Effect.fail(makeZerospinError('async-input-required'))
        : yield* validateAsyncValues(
            contract,
            command.payload,
            command.asyncInput.external,
          );
  const payload =
    asyncValues === undefined
      ? yield* validatePayload(contract, {
          version: contract.version,
          payload: command.payload,
        })
      : asyncValues.payload;
  const claims =
    contract.claims === undefined
      ? inputClaims
      : yield* runProgram(
          Schema.decodeUnknownEffect(Schema.toType(contract.claims))(
            inputClaims,
          ).pipe(
            mapParseError({
              code: 'contract-claims-invalid',
              prefix: 'Invalid contract claims',
            }),
          ),
        );
  yield* runContractGuard({
    contract,
    db: props.db,
    payload,
    claims,
    ...(asyncValues === undefined ? {} : { external: asyncValues.external }),
  });
  const operations: IContractOutput[] = [];
  let result = yield* runProgram(
    contract
      .program({
        db: props.db,
        payload,
        claims,
        ...(asyncValues === undefined
          ? {}
          : { external: asyncValues.external }),
      })
      .pipe(
        Effect.provideService(operationSink<IContractOutput>(), {
          emit: operation => {
            operations.push(operation);
          },
        }),
      ),
  ).pipe(
    Effect.catch(failure =>
      isZerospinError(failure) && !('scope' in failure)
        ? Effect.fail(failure)
        : validateFailure(contract, failure, 'contract').pipe(
            Effect.flatMap(Effect.fail),
          ),
    ),
  );
  if (contract.mapping !== undefined) {
    yield* encodeContractResult(contract.mapping.original, result);
    const baseOperations = Object.freeze(operations.map(snapshotOperation));
    yield* assertOperationsUseModels({
      operations: baseOperations.filter(
        operation => operation.operationName !== 'async',
      ),
      models: contract.mapping.original.models,
      commandName: command.commandName,
    });
    const mappedOperations: IContractOutput[] = [];
    result = yield* runProgram(
      contract.mapping
        .program({
          command: Object.freeze({
            id: command.id,
            commandName: command.commandName,
            contractVersion: command.contractVersion,
            payload: freezeCollectedValue(structuredClone(payload)),
            operations: baseOperations,
            result: freezeCollectedValue(structuredClone(result)),
          }),
          db: props.db,
          claims,
        })
        .pipe(
          Effect.provideService(operationSink<IContractOutput>(), {
            emit: operation => mappedOperations.push(operation),
          }),
        ),
    ).pipe(
      Effect.catch(failure =>
        isZerospinError(failure) && !('scope' in failure)
          ? Effect.fail(failure)
          : validateFailure(contract, failure, 'contract').pipe(
              Effect.flatMap(Effect.fail),
            ),
      ),
    );
    yield* assertOperationsUseModels({
      operations: mappedOperations.filter(
        operation => operation.operationName !== 'async',
      ),
      models: contract.mapping.models,
      commandName: command.commandName,
    });
    for (const operation of mappedOperations) {
      if (
        operation.operationName === 'async' &&
        contract.mapping.contracts[operation.contract.commandName] !==
          operation.contract
      ) {
        return yield* makeZerospinError('async-emission-out-of-scope');
      }
    }
    operations.push(...mappedOperations);
  }
  const encodedResult = yield* encodeContractResult(contract, result);
  yield* assertOperationsUseModels({
    operations: operations.filter(
      operation => operation.operationName !== 'async',
    ),
    models,
    commandName: command.commandName,
  });
  return {
    contractVersion: contract.version,
    payload,
    operations,
    result,
    encodedResult,
  };
});

/** Isolate the mapper's read-only collected input from retained base output. */
function freezeCollectedValue<A>(value: A): A {
  if (typeof value === 'object' && value !== null) {
    for (const child of Object.values(value)) freezeCollectedValue(child);
    Object.freeze(value);
  }
  return value;
}

function snapshotOperation<O extends IContractOutput>(operation: O): O {
  return Object.freeze(
    'model' in operation
      ? Object.assign({}, operation, {
          body: freezeCollectedValue(structuredClone(operation.body)),
        })
      : Object.assign({}, operation, {
          payload: freezeCollectedValue(structuredClone(operation.payload)),
        }),
  );
}
