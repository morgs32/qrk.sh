import { Schema, type Effect } from 'effect';

import type {
  IActorSelections,
  IAnyActorDbVersion,
  ValidActorSelections,
} from '../models/make/makeActorDbVersion.ts';

import {
  makeServiceActorVersion,
  ServiceActorVersionSchema,
} from './make/makeServiceActorVersion.ts';
import type { IAnyServiceActorVersion } from './types.ts';
type Merge<A, B> = Omit<A, keyof B> & B;

/** Inherit declaration fields; merge selections by key. A changed database requires selections constructed from that database. */
export function updateServiceActorVersion<
  const PREVIOUS extends IAnyServiceActorVersion,
  const VERSION extends string,
  const DB extends IAnyActorDbVersion = PREVIOUS['db'],
  const IDENTITY extends IAnyServiceActorVersion['identity'] =
    PREVIOUS['identity'],
  const SELECTIONS extends IActorSelections = {},
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
    selections?: SELECTIONS & ValidActorSelections<DB['models'], SELECTIONS>;
  } & Partial<
    Omit<
      Parameters<
        typeof makeServiceActorVersion<
          CREDENTIALS,
          PREVIOUS['name'],
          VERSION,
          DB,
          IDENTITY,
          Merge<PREVIOUS['selections'], SELECTIONS>,
          AUTHORIZE_REQUIREMENTS
        >
      >[1],
      'selections'
    >
  >,
): ReturnType<
  typeof makeServiceActorVersion<
    CREDENTIALS,
    PREVIOUS['name'],
    VERSION,
    DB,
    IDENTITY,
    Merge<PREVIOUS['selections'], SELECTIONS>,
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
      selections: {
        ...actor.selections,
        ...(overrides.selections === undefined
          ? {}
          : Schema.decodeUnknownSync(
              Schema.Record(Schema.String, Schema.Unknown),
            )(overrides.selections)),
      },
    },
  ]);
}
