import type { IAnyError, IFrameworkError } from '@zerospin/error';
import type { IAnyShape, ITypeError } from '@zerospin/schema';
import '@zerospin/server-only';
import { Schema, type Effect } from 'effect';
import { mapValues } from 'es-toolkit';

import type { IDb, IResourceDbConfig } from '../../drizzle/types.ts';
import type {
  IAnyModels,
  IModel,
  InferCommandPayload,
} from '../../models/types.ts';
import type { IAsyncContractDefinition } from '../asyncContract.ts';
import { defineContract } from '../defineContract.ts';
import {
  FailuresSchema,
  type FailureType,
  type IFailures,
} from '../failures.ts';
import type { IOperationSink } from '../operationSink.ts';
import type { IContract, IModelOperations } from '../types.ts';

import {
  makeContractVersion,
  type IPayloadFieldDescriptor,
} from './makeContractVersion.ts';
import { makeModelOperations } from './makeModelOperations.ts';

type IResult<S> = S extends Schema.Codec<infer A, unknown> ? A : void;
type IProgramProps<
  P extends IAnyShape,
  X extends Schema.Codec<unknown, unknown>,
  M extends IAnyModels,
  F extends IFailures,
  C,
> = {
  payload: InferCommandPayload<P>;
  external: X['Type'];
  models: { readonly [K in keyof M]: IModelOperations<M[K]> };
  failures: F;
  claims: C;
  db: Readonly<Pick<IDb<IResourceDbConfig<M, Record<never, never>>>, 'query'>>;
};
export function makeAsyncContract<
  const N extends string,
  const V extends string,
  P extends Record<string, IPayloadFieldDescriptor>,
  X extends Schema.Codec<unknown, unknown>,
  const M extends IAnyModels = {},
  Y extends Schema.Codec<unknown, unknown> | undefined = undefined,
  const F extends IFailures = {},
  R = never,
  ER = never,
  C extends Schema.Codec<Readonly<Record<string, unknown>> | null, unknown> =
    Schema.Codec<Readonly<Record<string, unknown>> | null, unknown>,
>(props: {
  name: N;
  version: V;
  payload: P;
  models?: M;
  result?: Y;
  failures?: F;
  claims?: C;
  external: {
    result: X;
    timeoutMs?: number;
    retryDelayMs?: number;
    program: ((props: {
      payload: InferCommandPayload<P>;
    }) => Effect.Effect<X['Type'], IAnyError, ER>) &
      ([Extract<ER, IOperationSink>] extends [never]
        ? unknown
        : ITypeError<'External producers cannot emit model operations'>);
  };
  guard?: (
    props: Omit<IProgramProps<P, X, M, F, C['Type']>, 'models'>,
  ) => Effect.Effect<
    void,
    IFrameworkError | Extract<FailureType<F>, { scope: 'contract' }>,
    R
  >;
  program: (
    props: IProgramProps<P, X, M, F, C['Type']>,
  ) => Effect.Effect<
    IResult<Y>,
    IFrameworkError | Extract<FailureType<F>, { scope: 'contract' }>,
    R
  >;
}): IContract<
  N,
  P,
  V,
  IResult<Y>,
  Record<V, P>,
  M,
  R,
  IFrameworkError | Extract<FailureType<F>, { scope: 'contract' }>,
  R,
  F,
  Record<V, F>,
  C
> & {
  readonly async: IAsyncContractDefinition & {
    readonly external: {
      readonly result: X;
      readonly program: (props: {
        payload: InferCommandPayload<P>;
      }) => Effect.Effect<X['Type'], IAnyError, ER>;
    };
  };
};
export function makeAsyncContract(input: unknown): unknown {
  const codec = Schema.declare(
    (value: unknown): value is Schema.Codec<unknown, unknown> =>
      Schema.isSchema(value),
  );
  const fn = Schema.declare(
    (
      value: unknown,
    ): value is (props: {
      payload: unknown;
      external?: unknown;
      db: Readonly<Pick<IDb, 'query'>>;
      claims: Readonly<Record<string, unknown>> | null;
      models: Readonly<Record<string, IModelOperations<IModel>>>;
      failures: IFailures;
    }) => Effect.Effect<unknown, IAnyError, unknown> =>
      typeof value === 'function',
  );
  const externalFn = Schema.declare(
    (
      value: unknown,
    ): value is IAsyncContractDefinition['external']['program'] =>
      typeof value === 'function',
  );
  const duration = Schema.Number.check(
    Schema.isFinite(),
    Schema.isGreaterThan(0),
  );
  const props = Schema.decodeUnknownSync(
    Schema.Struct({
      name: Schema.NonEmptyString,
      version: Schema.String,
      payload: Schema.Record(
        Schema.String,
        Schema.declare(
          (value: unknown): value is IPayloadFieldDescriptor =>
            typeof value === 'object' && value !== null,
        ),
      ),
      models: Schema.optionalKey(
        Schema.Record(
          Schema.String,
          Schema.declare(
            (value: unknown): value is IModel =>
              typeof value === 'object' && value !== null,
          ),
        ),
      ),
      result: Schema.optionalKey(codec),
      claims: Schema.optionalKey(codec),
      failures: Schema.optionalKey(FailuresSchema),
      external: Schema.Struct({
        result: codec,
        program: externalFn,
        timeoutMs: Schema.optionalKey(duration),
        retryDelayMs: Schema.optionalKey(duration),
      }),
      program: fn,
      guard: Schema.optionalKey(fn),
    }),
    { onExcessProperty: 'error' },
  )(input);
  const base = makeContractVersion(defineContract(props.name), {
    version: props.version,
    payload: props.payload,
    models: props.models ?? {},
    ...(props.result === undefined ? {} : { result: props.result }),
    failures: props.failures ?? {},
  });
  const models = mapValues(base.models, makeModelOperations);
  return Object.assign(base, {
    ...(props.claims === undefined ? {} : { claims: props.claims }),
    async: Object.freeze({
      external: Object.freeze({
        ...props.external,
        timeoutMs: props.external.timeoutMs ?? 30_000,
        retryDelayMs: props.external.retryDelayMs ?? 1_000,
      }),
    }),
    program: (input: Parameters<IContract['program']>[0]) =>
      props.program({ ...input, models, failures: base.failures }),
    ...(props.guard === undefined
      ? {}
      : {
          guard: (input: Parameters<NonNullable<IContract['guard']>>[0]) =>
            props.guard!({ ...input, models, failures: base.failures }),
        }),
  });
}
