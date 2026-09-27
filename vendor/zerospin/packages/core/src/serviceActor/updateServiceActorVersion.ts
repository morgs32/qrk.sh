import { Schema, type Effect } from 'effect';

import type {
  IActorQueries,
  IAnyActorDbVersion,
  ValidActorQueries,
} from '../models/make/makeActorDbVersion.ts';

import {
  makeServiceActorVersion,
  ServiceActorVersionSchema,
} from './make/makeServiceActorVersion.ts';
import type { IAnyServiceActorVersion } from './types.ts';
type Merge<A, B> = Omit<A, keyof B> & B;

/** Inherit declaration fields; merge queries by key. A changed database requires queries constructed from that database. */
export function updateServiceActorVersion<
  const PREVIOUS extends IAnyServiceActorVersion,
  const VERSION extends string,
  const DB extends IAnyActorDbVersion = PREVIOUS['db'],
  const IDENTITY extends IAnyServiceActorVersion['identity'] =
    PREVIOUS['identity'],
  const QUERIES extends IActorQueries = {},
  AUTHORIZE_REQUIREMENTS = Effect.Services<
    ReturnType<NonNullable<PREVIOUS['authorize']>>
  >,
  const CREDENTIALS extends Schema.Codec<unknown, unknown> = Schema.Codec<
    unknown,
    unknown
  >,
>(
  previous: PREVIOUS,
  changes: {
    version: VERSION;
    queries?: QUERIES & ValidActorQueries<DB['models'], QUERIES>;
  } & Partial<
    Omit<
      Parameters<
        typeof makeServiceActorVersion<
          CREDENTIALS,
          PREVIOUS['name'],
          VERSION,
          DB,
          IDENTITY,
          Merge<PREVIOUS['queries'], QUERIES>,
          AUTHORIZE_REQUIREMENTS
        >
      >[1],
      'queries'
    >
  >,
): ReturnType<
  typeof makeServiceActorVersion<
    CREDENTIALS,
    PREVIOUS['name'],
    VERSION,
    DB,
    IDENTITY,
    Merge<PREVIOUS['queries'], QUERIES>,
    AUTHORIZE_REQUIREMENTS
  >
>;
export function updateServiceActorVersion(
  previous: unknown,
  changes: unknown,
): unknown {
  const actor = Schema.decodeUnknownSync(ServiceActorVersionSchema)(previous);
  const overrides = Schema.decodeUnknownSync(
    Schema.Record(Schema.String, Schema.Unknown),
  )(changes);
  return Reflect.apply(makeServiceActorVersion, undefined, [
    { name: actor.name },
    {
      db: actor.db,
      identity: actor.identity,
      authentication: actor.authentication,
      ...(actor.authorize === undefined ? {} : { authorize: actor.authorize }),
      ...overrides,
      queries: {
        ...actor.queries,
        ...(overrides.queries === undefined
          ? {}
          : Schema.decodeUnknownSync(
              Schema.Record(Schema.String, Schema.Unknown),
            )(overrides.queries)),
      },
    },
  ]);
}
