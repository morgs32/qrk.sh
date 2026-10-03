import type { IAnyError } from '@zerospin/error';
import { Effect, Schema } from 'effect';
import { mapValues } from 'es-toolkit';

import type { IDb, IResourceDbConfig } from '../../drizzle/types.ts';
import { Model } from '../../models/defineModel.ts';
import type {
  IAnyModels,
  IModel,
  InferCommandPayload,
} from '../../models/types.ts';
import '@zerospin/server-only';

import type { IAsyncContractDefinition } from '../asyncContract.ts';
import {
  emitOperation,
  type InferEmittedOperations,
  type IOperationSink,
} from '../operationSink.ts';
import type {
  ICommand,
  IContract,
  IContractOutput,
  IModelOperations,
  InferContractOperations,
  InferContractResult,
  InferFailure,
} from '../types.ts';
import { validatePayload } from '../validatePayload.ts';

import { Contract, type InferContractProgram } from './makeContractVersion.ts';
import { makeModelOperations } from './makeModelOperations.ts';

export interface IContractMapping {
  readonly original: IContract;
  readonly models: IAnyModels;
  readonly contracts: Readonly<Record<string, IContract>>;
  readonly program: {
    bivarianceHack(props: {
      command: ICommand & {
        readonly operations: readonly IContractOutput[];
        readonly result: unknown;
      };
      db: Readonly<Pick<IDb, 'query'>>;
      claims: Readonly<Record<string, unknown>> | null;
    }): Effect.Effect<unknown, IAnyError, unknown>;
  }['bivarianceHack'];
}
export type IAsyncOperation<C extends IContract = IContract> = Readonly<{
  operationName: 'async';
  contract: C;
  payload: InferCommandPayload<C['payload']>;
}>;

export function mapContractVersion<
  C extends IContract,
  const M extends IAnyModels,
  const A extends Readonly<
    Record<string, IContract & { readonly async: IAsyncContractDefinition }>
  >,
  S extends Schema.Codec<unknown, unknown>,
  R = never,
>(props: {
  contractVersion: C;
  operations: { models: M; contracts: A };
  result: S;
  program: (props: {
    command: Readonly<
      ICommand<
        C['commandName'],
        C['version'],
        InferCommandPayload<C['payload']>
      > & {
        readonly operations: readonly InferContractOperations<C>[];
        readonly result: InferContractResult<C>;
      }
    >;
    db: Readonly<
      Pick<IDb<IResourceDbConfig<M, Record<never, never>>>, 'query'>
    >;
    claims: NonNullable<C['claims']>['Type'];
    failures: C['failures'];
    operations: {
      models: { readonly [K in keyof M]: IModelOperations<M[K]> };
      contracts: {
        readonly [K in keyof A]: (
          payload: InferCommandPayload<A[K]['payload']>,
        ) => Effect.Effect<
          void,
          IAnyError,
          IOperationSink<IAsyncOperation<A[K]>>
        >;
      };
    };
  }) => Effect.Effect<S['Type'], InferFailure<C> | IAnyError, R>;
}): Omit<C, 'program' | 'result' | '__operations'> & {
  readonly program: InferContractProgram<
    C['payload'],
    S['Type'],
    Effect.Services<ReturnType<C['program']>> | R
  >;
  readonly result: S;
  readonly mapping: IContractMapping & { readonly original: C };
  readonly __operations?:
    | InferContractOperations<C>
    | InferEmittedOperations<R>;
};
export function mapContractVersion(input: unknown): unknown {
  const props = Schema.decodeUnknownSync(
    Schema.Struct({
      contractVersion: Schema.declare(
        (v: unknown): v is IContract =>
          v instanceof Contract && !('async' in v) && !('mapping' in v),
      ),
      operations: Schema.Struct({
        models: Schema.Record(
          Schema.String,
          Schema.declare((v: unknown): v is IModel => v instanceof Model),
        ),
        contracts: Schema.Record(
          Schema.String,
          Schema.declare(
            (v: unknown): v is IContract =>
              v instanceof Contract && 'async' in v,
          ),
        ),
      }),
      result: Schema.declare(
        (v: unknown): v is Schema.Codec<unknown, unknown> => Schema.isSchema(v),
      ),
      program: Schema.declare(
        (
          v: unknown,
        ): v is (
          props: Parameters<IContractMapping['program']>[0] & {
            failures: IContract['failures'];
            operations: {
              models: Readonly<Record<string, IModelOperations<IModel>>>;
              contracts: Readonly<
                Record<
                  string,
                  (
                    payload: unknown,
                  ) => Effect.Effect<
                    void,
                    IAnyError,
                    IOperationSink<IAsyncOperation>
                  >
                >
              >;
            };
          },
        ) => Effect.Effect<unknown, IAnyError, unknown> =>
          typeof v === 'function',
      ),
    }),
    { onExcessProperty: 'error' },
  )(input);
  const original = props.contractVersion;
  const contracts = Object.freeze({ ...props.operations.contracts });
  const models = Object.freeze({ ...props.operations.models });
  const bound = {
    models: mapValues(models, makeModelOperations),
    contracts: mapValues(
      contracts,
      contract => (payload: unknown) =>
        Effect.gen(function* () {
          const validated = yield* validatePayload(contract, {
            version: contract.version,
            payload,
          });
          yield* emitOperation({
            operationName: 'async' as const,
            contract,
            payload: structuredClone(validated),
          });
        }),
    ),
  };
  const mapping: IContractMapping = Object.freeze({
    original,
    models,
    contracts,
    program: (input: Parameters<IContractMapping['program']>[0]) =>
      props.program({
        ...input,
        db: {
          query: Object.fromEntries(
            Object.entries(input.db.query).filter(([name]) =>
              Object.hasOwn(models, name),
            ),
          ),
        },
        failures: original.failures,
        operations: bound,
      }),
  });
  return Object.assign(
    Object.defineProperties(new Contract(), {
      previous: { get: () => original.previous },
      next: { get: () => original.next },
      up: { get: () => original.up },
      down: { get: () => original.down },
    }),
    original,
    {
      result: props.result,
      mapping,
      spec: {
        ...original.spec,
        resultJsonSchema: Schema.toJsonSchemaDocument(props.result),
        models: mapValues({ ...original.models, ...models }, model =>
          structuredClone(model.spec),
        ),
      },
    },
  );
}
