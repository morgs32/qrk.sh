/*
 * System-worker annotation:
 * Defines the AuthorizationRepo Durable Object shell and local storage wiring.
 * Public RPC/lifecycle methods should delegate to same-named Effect functions instead of growing inline workflow bodies here.
 */

import { RoutePattern } from '@remix-run/route-pattern';
import type { IActor } from '@zerospin/core/actorController/types';
import type {} from '@zerospin/core/async/Async';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeResourceDbConfig } from '@zerospin/core/drizzle/makeDbConfig';
import { makeDrizzleSchemasRecordFromTables } from '@zerospin/core/drizzle/makeDrizzleSchemas';
import { makeTable } from '@zerospin/core/models/makeTable';
import { primitives } from '@zerospin/core/models/primitives';
import type { IAnyTables, IShape } from '@zerospin/core/models/types';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { encodeRpc } from '@zerospin/core/utils/encodeRpc';
import { getByKeyOrThrow } from '@zerospin/core/utils/getByKeyOrThrow';
import { type IAnyErrorJson } from '@zerospin/error';
import { Effect, type Schema } from 'effect';
import { BrandTypeId } from 'effect/Brand';
import { system } from 'system';

import { makeRepo } from '../makeRepo/makeRepo.js';
import { makeRepoUtils } from '../makeRepo/makeRepoUtils.js';
import { managedRuntime } from '../managedRuntime.js';
import type { IAuthorizedActorFrontend } from '../types.js';

import { authorize } from './authorize/authorize.js';
import { getAuthorizedActorFrontends } from './getAuthorizedActorFrontends/getAuthorizedActorFrontends.js';

const authorizationAttemptShape = {
  authorizationAttemptCursor: primitives.cursor({
    abbreviation: coreAbbreviations.authorizationAttemptCursor,
  }),
  actorId: primitives.text(),
  actorName: primitives.text(),
  frontendName: primitives.text(),
  attemptedAt: primitives.date(),
  status: primitives.enum({ values: ['failed', 'succeeded'] }),
  failure: primitives.text({ nullable: true }),
} satisfies IShape;

const authorizationShape = {
  actorId: primitives.text(),
  actorName: primitives.text(),
  frontendName: primitives.text(),
  status: primitives.enum({ values: ['failed', 'succeeded'] }),
  failure: primitives.text({ nullable: true }),
} satisfies IShape;

export const authorizationRepoTables = {
  authorizationAttempts: makeTable({
    name: 'authorizationAttempts',
    shape: authorizationAttemptShape,
    indexes: [
      {
        name: 'authorizationAttempts_authorizationAttemptCursor_idx',
        columns: ['authorizationAttemptCursor'],
        unique: true,
      },
    ],
  }),
  authorizations: makeTable({
    name: 'authorizations',
    shape: authorizationShape,
    indexes: [
      {
        name: 'authorizations_actor_frontend_idx',
        columns: ['actorId', 'actorName', 'frontendName'],
        unique: true,
      },
    ],
  }),
} satisfies IAnyTables;

export const authorizationRepoDrizzleSchemas =
  makeDrizzleSchemasRecordFromTables(authorizationRepoTables);

const authorizationRepoUtils = makeRepoUtils({
  abbreviation: coreAbbreviations.authorizationRepo,
  repoType: 'AuthorizationRepo',
  namePattern: RoutePattern.parse('/:generationId/:accountId/:accountName'),
  managedRuntime,
  getDbConfig: Effect.fn('AuthorizationRepo.getDbConfig')(function* (props) {
    const { key } = props;
    const { accountName } = key;

    const accountController = yield* getByKeyOrThrow({
      record: system.accountControllers,
      key: accountName,
      recordKind: 'accountControllers',
    });

    return makeResourceDbConfig({
      models: accountController.models,
      otherTables: authorizationRepoTables,
    });
  }),
});

/**
 * AuthorizationRepo (one per `accountId` + `accountName`, `AUTHORIZATION_REPO` binding).
 *
 * Owns authorization attempts and authorized actor/frontend membership.
 * Lookup: `getAuthorizationRepo`.
 */
export class AuthorizationRepo extends makeRepo({
  repoUtils: authorizationRepoUtils,
}) {
  declare [BrandTypeId]: { readonly TargetApi: 'TargetApi' };

  static override readonly repoUtils = authorizationRepoUtils;

  async authorize(props: {
    actor: IActor;
    accountName: string;
    actorName: string;
    frontendName: string;
  }): Promise<Schema.EitherEncoded<void, IAnyErrorJson>> {
    return managedRuntime.runPromise(
      authorize({
        db: this.db,
        accountName: this.key.accountName,
        actor: props.actor,
        actorName: props.actorName,
        frontendName: props.frontendName,
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  async getAuthorizedActorFrontends(_props: {
    accountName: string;
  }): Promise<
    Schema.EitherEncoded<ReadonlyArray<IAuthorizedActorFrontend>, IAnyErrorJson>
  > {
    return managedRuntime.runPromise(
      Effect.gen(this, function* () {
        const { accountId } = this.key;
        return yield* getAuthorizedActorFrontends({
          accountId,
          db: this.db,
        });
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }
}
