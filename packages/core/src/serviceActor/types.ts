import type { IAnyError } from '@zerospin/error';
import type { Effect } from 'effect';

import type { IAnyOwnerGuard } from '../contracts/ownerGuards.ts';
import type { IAnyContracts } from '../contracts/types.ts';
import type { IDb } from '../drizzle/types.ts';
import type { IActorIdentity } from '../identity/make/makeActorIdentity/makeActorIdentity.ts';
import type { IServiceAuthentication } from '../identity/types.ts';
import type {
  IActorSelections,
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
  readonly contracts: IAnyContracts;
  readonly guards: Readonly<Record<string, IAnyOwnerGuard | undefined>>;
  readonly name: string;
  readonly version: string;
  readonly db: IAnyActorDbVersion;
  readonly selections: IActorSelections;
  readonly capturedSelections: IServiceActorSelections;
  readonly identity: IActorIdentity;
  readonly authentication: IServiceAuthentication;
  readonly authorize?: {
    bivarianceHack(props: unknown): Effect.Effect<void, IAnyError, unknown>;
  }['bivarianceHack'];
  readonly __authorizeRequirements?: unknown;
};
