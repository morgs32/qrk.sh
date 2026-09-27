import type { IAnyError } from '@zerospin/error';
import type { Effect } from 'effect';

import type { IAnyAutomation } from '../automation/types.ts';
import type { IAnyOwnerGuard } from '../contracts/ownerGuards.ts';
import type { IAnyContracts } from '../contracts/types.ts';
import type { IDb } from '../drizzle/types.ts';
import type { IActorIdentity } from '../identity/make/makeActorIdentity/makeActorIdentity.ts';
import type { IAggregateAuthentication } from '../identity/types.ts';
import type {
  IActorQueries,
  IAnyActorDbVersion,
  ISelection,
} from '../models/make/makeActorDbVersion.ts';

export type IAggregateActorSelections = Readonly<Record<string, ISelection>>;

export type IAggregateActorAuthorization<
  IDENTITY = Readonly<Record<string, unknown>>,
  R = never,
> = {
  bivarianceHack(props: {
    identity: IDENTITY;
    aggregateId: string;
    sessionName: string;
    db: Readonly<Pick<IDb, 'query'>>;
  }): Effect.Effect<void, IAnyError, R>;
}['bivarianceHack'];

export type IAnyAggregateActorVersion = {
  readonly kind: 'aggregate';
  readonly name: string;
  readonly version: string;
  readonly db: IAnyActorDbVersion;
  readonly queries: IActorQueries;
  readonly selections: IAggregateActorSelections;
  readonly contracts: IAnyContracts;
  readonly automations: Readonly<Record<string, IAnyAutomation>>;
  readonly guards: Readonly<Record<string, IAnyOwnerGuard | undefined>>;
  readonly __contractRequirements?: unknown;
  readonly identity: IActorIdentity;
  readonly authentication: IAggregateAuthentication;
  readonly authorize?: {
    bivarianceHack(props: unknown): Effect.Effect<void, IAnyError, unknown>;
  }['bivarianceHack'];
  readonly __authorizeRequirements?: unknown;
};
