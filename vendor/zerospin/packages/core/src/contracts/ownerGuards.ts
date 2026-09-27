import type { IFrameworkError, IScopedError } from '@zerospin/error';
import { Schema, type Effect } from 'effect';

import type { IDb, IResourceDbConfig } from '../drizzle/types.ts';
import type { IAnyModels, InferCommandPayload } from '../models/types.ts';

import type { IAnyContracts, InferFailure } from './types.ts';

export type IOwnerGuards<
  CONTRACTS extends IAnyContracts,
  MODELS extends IAnyModels,
  IDENTITY,
  SCOPE extends IScopedError['scope'],
  REQUIREMENTS = never,
> = {
  readonly [K in keyof CONTRACTS]?: (props: {
    queryDb: string extends keyof MODELS
      ? Readonly<Pick<IDb, 'query'>>
      : Readonly<
          Pick<IDb<IResourceDbConfig<MODELS, Record<never, never>>>, 'query'>
        >;
    payload: InferCommandPayload<CONTRACTS[K]['payload']>;
    identity: IDENTITY;
    failures: CONTRACTS[K]['failures'];
  }) => Effect.Effect<
    void,
    | IFrameworkError
    | Extract<InferFailure<CONTRACTS[K]>, { readonly scope: SCOPE }>,
    REQUIREMENTS
  >;
};

// The registry erases each owner's model, payload, and identity parameters.
export type IAnyOwnerGuard = (
  // oxlint-disable-next-line typescript/no-explicit-any -- owner callbacks are validated before registry erasure
  props: any,
) => Effect.Effect<void, IFrameworkError | IScopedError, unknown>;

export const OwnerGuardsSchema = Schema.Record(
  Schema.String,
  Schema.declare(
    (value: unknown): value is IAnyOwnerGuard => typeof value === 'function',
  ),
);
