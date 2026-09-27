import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { applyAggregateMutationTx } from '@zerospin/core/contracts/applyAggregateMutationTx';
import { encodeMutation } from '@zerospin/core/contracts/encodeAppliedMutation';
import { makeModelMutations } from '@zerospin/core/contracts/make/makeModelMutations';
import { makeResourceDbConfig } from '@zerospin/core/drizzle/make/makeDbConfig/makeDbConfig';
import { makeTx } from '@zerospin/core/drizzle/make/makeTx';
import { game } from '@zerospin/fixtures/system-worker/workerd/automationFixture';
import { Effect } from 'effect';
import { expect, it } from 'vitest';

import { makeActorSnapshotDb } from '../validateCommands/makeActorSnapshotDb.js';

import { makeOptimisticActorDb } from './makeOptimisticActorDb.js';

it('rebuilds optimism over newer authoritative rows without changing them', async () => {
  const scope = Effect.scoped(
    Effect.gen(function* () {
      const models = { automationGame: game };
      const authoritative = yield* makeActorSnapshotDb(
        makeResourceDbConfig({ models }),
      );
      const now = new Date('2026-09-25T00:00:00.000Z');
      const created = yield* makeModelMutations(game).create({
        resourceId: 'gam_selected',
        attributes: { turn: 'X', value: 1 },
      });
      yield* makeTx('ActorOptimism.fixtureCreate')(function* (tx) {
        yield* applyAggregateMutationTx({
          tx,
          mutation: created,
          commandId: 'cmd_confirmed',
          mutationIndex: 0,
          appliedAt: now,
        });
      })(authoritative.db);
      const mutation = yield* makeModelMutations(game).update({
        resourceId: 'gam_selected',
        attributes: { turn: 'O' },
      });
      const encoded = yield* encodeMutation({
        commandId: 'cmd_pending',
        mutationIndex: 0,
        mutation,
      });
      const rebuild = () =>
        makeOptimisticActorDb({
          authoritativeDb: authoritative.db,
          models,
          pending: [
            { commandId: 'cmd_pending', appliedAt: now, mutations: [encoded] },
          ],
        });
      const first = yield* rebuild();
      expect(first.db.query.automationGame?.findFirst().sync()).toMatchObject({
        turn: 'O',
        value: 1,
      });
      expect(
        authoritative.db.query.automationGame?.findFirst().sync(),
      ).toMatchObject({
        turn: 'X',
        value: 1,
      });
      const confirmedUpdate = yield* makeModelMutations(game).update({
        resourceId: 'gam_selected',
        attributes: { value: 2 },
      });
      yield* makeTx('ActorOptimism.fixtureUpdate')(function* (tx) {
        yield* applyAggregateMutationTx({
          tx,
          mutation: confirmedUpdate,
          commandId: 'cmd_newer',
          mutationIndex: 0,
          appliedAt: now,
        });
      })(authoritative.db);
      const second = yield* rebuild();
      expect(second.db.query.automationGame?.findFirst().sync()).toMatchObject({
        turn: 'O',
        value: 2,
      });
      expect(second.unappliedCommandIds).toEqual([]);
    }),
  );
  await Effect.runPromise(scope.pipe(Effect.provide(AsyncLive)));
});
