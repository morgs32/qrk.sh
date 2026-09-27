import { Schema, type Effect } from 'effect';

import type {
  IActorCommandGuards,
  IAnyAutomation,
} from '../automation/types.ts';
import type { IAnyOwnerGuard } from '../contracts/ownerGuards.ts';
import type { IAnyContracts } from '../contracts/types.ts';
import type { IAggregateAuthentication } from '../identity/types.ts';
import type {
  IActorQueries,
  IAnyActorDbVersion,
  ValidActorQueries,
} from '../models/make/makeActorDbVersion.ts';

import {
  AggregateActorVersionSchema,
  constructAggregateActorVersion,
  type ActorGuardRequirements,
  type IAggregateActorVersion,
  type ValidActorContracts,
} from './make/makeAggregateActorVersion/makeAggregateActorVersion.ts';
import type {
  IAggregateActorAuthorization,
  IAnyAggregateActorVersion,
} from './types.ts';

type Merge<A, B> = Omit<A, keyof B> & B;
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type AuthorizeRequirements<
  AUTHORIZE extends IAnyAggregateActorVersion['authorize'],
> = Effect.Services<ReturnType<NonNullable<AUTHORIZE>>>;
const ChangesSchema = Schema.Struct({
  version: Schema.Unknown,
  db: Schema.optionalKey(Schema.Unknown),
  identity: Schema.optionalKey(Schema.Unknown),
  authentication: Schema.optionalKey(Schema.Unknown),
  queries: Schema.optionalKey(Schema.Unknown),
  contracts: Schema.optionalKey(Schema.Unknown),
  automations: Schema.optionalKey(Schema.Unknown),
  guards: Schema.optionalKey(Schema.Unknown),
  authorize: Schema.optionalKey(Schema.Unknown),
});

function merge<A extends object, B extends object>(
  previous: A,
  changes?: B,
): Merge<A, B> {
  return Object.assign({}, previous, changes);
}

/** Inherit omitted fields and replace supplied map entries by key. */
export function updateAggregateActorVersion<
  const PREVIOUS extends IAnyAggregateActorVersion,
  const VERSION extends string,
  const DB extends IAnyActorDbVersion = PREVIOUS['db'],
  const IDENTITY extends IAnyAggregateActorVersion['identity'] =
    PREVIOUS['identity'],
  const QUERIES extends IActorQueries = {},
  const CONTRACTS extends IAnyContracts = {},
  const AUTOMATIONS extends Readonly<Record<string, IAnyAutomation>> = {},
  const GUARDS extends Readonly<Record<string, IAnyOwnerGuard | undefined>> =
    {},
  const AUTHORIZE extends IAnyAggregateActorVersion['authorize'] = NonNullable<
    PREVIOUS['authorize']
  >,
  AUTHORIZE_REQUIREMENTS = never,
  GUARD_REQUIREMENTS = never,
  const CREDENTIALS extends Schema.Codec<unknown, unknown> = Schema.Codec<
    unknown,
    unknown
  >,
>(
  previous: PREVIOUS,
  changes: {
    version: VERSION;
    authentication?: IAggregateAuthentication<
      CREDENTIALS,
      IDENTITY['identitySchema']
    >;
    db?: DB;
    identity?: IDENTITY &
      (IDENTITY['identitySchema']['Type'] extends {
        readonly aggregateId: string;
      }
        ? unknown
        : never);
    queries?: QUERIES & ValidActorQueries<DB['models'], QUERIES>;
    contracts?: CONTRACTS;
    automations?: AUTOMATIONS;
    guards?: GUARDS &
      IActorCommandGuards<
        NoInfer<Merge<PREVIOUS['contracts'], CONTRACTS>>,
        NoInfer<Merge<PREVIOUS['automations'], AUTOMATIONS>>,
        DB['models'],
        IDENTITY['identitySchema']['Type'],
        IDENTITY['actorSchema']['Type'],
        'actor',
        GUARD_REQUIREMENTS
      >;
    authorize?: AUTHORIZE &
      IAggregateActorAuthorization<
        IDENTITY['identitySchema']['Type'],
        AUTHORIZE_REQUIREMENTS
      >;
  } & (Same<DB, PREVIOUS['db']> extends true ? unknown : { db: DB }) &
    (Same<IDENTITY, PREVIOUS['identity']> extends true
      ? unknown
      : { identity: IDENTITY }) &
    (Same<AUTHORIZE, NonNullable<PREVIOUS['authorize']>> extends true
      ? unknown
      : { authorize: AUTHORIZE }) &
    (Merge<PREVIOUS['queries'], QUERIES> extends ValidActorQueries<
      DB['models'],
      Merge<PREVIOUS['queries'], QUERIES>
    >
      ? unknown
      : { queries: never }) &
    (Merge<PREVIOUS['contracts'], CONTRACTS> extends ValidActorContracts<
      Merge<PREVIOUS['contracts'], CONTRACTS>,
      DB['models'],
      IDENTITY['identitySchema']['Type']
    >
      ? unknown
      : { contracts: never }) &
    (Merge<PREVIOUS['guards'], GUARDS> extends IActorCommandGuards<
      Merge<PREVIOUS['contracts'], CONTRACTS>,
      Merge<PREVIOUS['automations'], AUTOMATIONS>,
      DB['models'],
      IDENTITY['identitySchema']['Type'],
      IDENTITY['actorSchema']['Type'],
      'actor',
      ActorGuardRequirements<Merge<PREVIOUS['guards'], GUARDS>>
    >
      ? unknown
      : { guards: never }),
): IAggregateActorVersion<
  PREVIOUS['name'],
  VERSION,
  DB,
  IDENTITY,
  Merge<PREVIOUS['queries'], QUERIES>,
  Merge<PREVIOUS['contracts'], CONTRACTS>,
  AuthorizeRequirements<AUTHORIZE>,
  ActorGuardRequirements<Merge<PREVIOUS['guards'], GUARDS>>,
  Merge<PREVIOUS['automations'], AUTOMATIONS>,
  Merge<PREVIOUS['guards'], GUARDS>,
  AUTHORIZE
> {
  Schema.decodeUnknownSync(AggregateActorVersionSchema)(previous);
  Schema.decodeUnknownSync(ChangesSchema, { onExcessProperty: 'error' })(
    changes,
  );
  const fields = Object.assign(
    {
      db: previous.db,
      identity: previous.identity,
      authentication: previous.authentication,
      authorize: previous.authorize,
    },
    changes,
  );
  return constructAggregateActorVersion<
    PREVIOUS['name'],
    VERSION,
    DB,
    IDENTITY,
    Merge<PREVIOUS['queries'], QUERIES>,
    Merge<PREVIOUS['contracts'], CONTRACTS>,
    AuthorizeRequirements<AUTHORIZE>,
    ActorGuardRequirements<Merge<PREVIOUS['guards'], GUARDS>>,
    Merge<PREVIOUS['automations'], AUTOMATIONS>,
    Merge<PREVIOUS['guards'], GUARDS>,
    AUTHORIZE
  >(
    { name: previous.name },
    {
      version: changes.version,
      db: fields.db,
      identity: fields.identity,
      authentication: fields.authentication,
      ...(fields.authorize === undefined
        ? {}
        : { authorize: fields.authorize }),
      queries: merge(previous.queries, changes.queries),
      contracts: merge(previous.contracts, changes.contracts),
      automations: merge(previous.automations, changes.automations),
      guards: merge(previous.guards, changes.guards),
    },
  );
}
