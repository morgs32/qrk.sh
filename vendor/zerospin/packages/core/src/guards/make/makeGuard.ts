import type { IFrameworkError } from '@zerospin/error';
import { Schema, type Effect } from 'effect';

import {
  FailuresSchema,
  type FailureType,
  type IFailures,
} from '../../contracts/failures.ts';
import type { IDb, IResourceDbConfig } from '../../drizzle/types.ts';
import type { IAnyModels } from '../../models/types.ts';

/**
 * Infer a reusable check's query capability and decoded inputs from declarations.
 * Injects declared error constructors: callers supply the database and
 * already-decoded inputs. Owning guard declarations enforce failure scopes.
 */
export function makeGuard<
  const MODELS extends IAnyModels,
  PAYLOAD extends Schema.Top,
  IDENTITY extends Schema.Top,
  const FAILURES extends IFailures = Record<never, never>,
  ERROR extends IFrameworkError | NoInfer<FailureType<FAILURES>> = never,
  REQUIREMENTS = never,
>(props: {
  models: MODELS;
  failures?: FAILURES;
  payload: PAYLOAD;
  identity: IDENTITY;
  program: (props: {
    failures: NoInfer<FAILURES>;
    db: Readonly<
      Pick<IDb<IResourceDbConfig<MODELS, Record<never, never>>>, 'query'>
    >;
    payload: PAYLOAD['Type'];
    identity: IDENTITY['Type'];
  }) => Effect.Effect<void, ERROR, REQUIREMENTS>;
}): (input: {
  db: Readonly<
    Pick<IDb<IResourceDbConfig<MODELS, Record<never, never>>>, 'query'>
  >;
  payload: PAYLOAD['Type'];
  identity: IDENTITY['Type'];
}) => Effect.Effect<void, ERROR, REQUIREMENTS>;
export function makeGuard(props: unknown): unknown {
  const definition = Schema.decodeUnknownSync(
    Schema.Struct({
      models: Schema.Unknown,
      payload: Schema.Unknown,
      identity: Schema.Unknown,
      failures: Schema.optionalKey(FailuresSchema),
      program: Schema.declare(
        (
          value: unknown,
        ): value is (input: {
          db: Readonly<Pick<IDb, 'query'>>;
          payload: unknown;
          identity: unknown;
          failures: IFailures;
        }) => Effect.Effect<void, unknown, unknown> =>
          typeof value === 'function',
      ),
    }),
    { onExcessProperty: 'error' },
  )(props);
  const failures = Object.freeze({ ...definition.failures });
  return (input: {
    db: Readonly<Pick<IDb, 'query'>>;
    payload: unknown;
    identity: unknown;
  }) => definition.program({ ...input, failures });
}
