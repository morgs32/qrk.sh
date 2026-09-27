import type { IAnyError } from '@zerospin/error';
import type { Effect } from 'effect';

import type { IDb } from '../drizzle/types.ts';
import type { IActorIdentity } from '../identity/make/makeActorIdentity/makeActorIdentity.ts';
import type { IServiceAuthentication } from '../identity/types.ts';
import type {
  IActorQueries,
  IAnyActorDbVersion,
  ISelection,
} from '../models/make/makeActorDbVersion.ts';

export type IServiceActorSelections = Readonly<Record<string, ISelection>>;

export type IServiceActorAuthorization<
  CLAIMS = Readonly<Record<string, unknown>>,
  R = never,
> = {
  bivarianceHack(props: {
    claims: CLAIMS;
    sessionName: string;
    db: Readonly<Pick<IDb, 'query'>>;
  }): Effect.Effect<void, IAnyError, R>;
}['bivarianceHack'];

export type IAnyServiceActorVersion = {
  readonly kind: 'service';
  readonly name: string;
  readonly version: string;
  readonly db: IAnyActorDbVersion;
  readonly queries: IActorQueries;
  readonly selections: IServiceActorSelections;
  readonly identity: IActorIdentity;
  readonly authentication: IServiceAuthentication;
  readonly authorize?: {
    bivarianceHack(props: unknown): Effect.Effect<void, IAnyError, unknown>;
  }['bivarianceHack'];
  readonly __authorizeRequirements?: unknown;
};
