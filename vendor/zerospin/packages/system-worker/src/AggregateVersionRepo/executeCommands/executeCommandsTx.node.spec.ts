import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { AggregateChainedCommandSchema } from '@zerospin/core/contracts/CommandSchema';
import { encodeMutation } from '@zerospin/core/contracts/encodeAppliedMutation';
import { makeModelMutations } from '@zerospin/core/contracts/make/makeModelMutations';
import { makeResourceDbConfig } from '@zerospin/core/drizzle/make/makeDbConfig/makeDbConfig';
import { defineModel } from '@zerospin/core/models/defineModel';
import { makeModelVersion } from '@zerospin/core/models/make/makeModelVersion';
import type { IAnyModels } from '@zerospin/core/models/types';
import { makeZerospinError } from '@zerospin/error';
import { primitives } from '@zerospin/schema';
import config from 'config';
import { sql } from 'drizzle-orm';
import { Effect, Schema } from 'effect';
import { expect, it } from 'vitest';

import { makeActorSnapshotDb } from '../../AggregateActorVersionRepo/validateCommands/makeActorSnapshotDb.js';
import { genesisDispositionHash } from '../../aggregateDispositionHash/aggregateDispositionHash.js';
import { aggregateVersionRepoDbConfig } from '../aggregateVersionRepoDbConfig.js';

import { executeCommandsTx } from './executeCommandsTx.js';

it.each(['replica-first', 'reference-first'] as const)(
  'applies %s results in program order and rolls back invalid dependencies',
  async order => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const aggregate = config.system.aggregates['user']?.['1.0.0'];
        if (aggregate === undefined) {
          throw new Error('Missing aggregate fixture');
        }
        const registeredModels: IAnyModels = aggregate.models;
        const product = registeredModels['product'];
        const serviceVersion = aggregate.services['app'];
        if (product === undefined || serviceVersion === undefined) {
          throw new Error('Missing product replica fixture');
        }
        const productLink = makeModelVersion(
          defineModel({ name: 'productLink', abbreviation: 'plk' }),
          {
            version: '1.0.0',
            attributes: {
              productId: primitives.ref({
                table: product.table,
                relation: 'product',
                inverse: 'links',
              }),
            },
            indexes: [],
          },
        );
        const models: IAnyModels = { ...aggregate.models, productLink };
        const { db } = yield* makeActorSnapshotDb(
          makeResourceDbConfig({
            models,
            otherTables: aggregateVersionRepoDbConfig.tables,
          }),
        );
        // Snapshot fixtures disable foreign keys for partial selections; authoritative execution enables them.
        db.run(sql`PRAGMA foreign_keys = ON`);
        const startedAt = new Date('2026-09-25T12:00:00Z');
        const head = {
          singletonId: 1,
          aggregateIndex: 0,
          executedIndex: 0,
          dispositionHash: genesisDispositionHash(),
        };
        db.insert(aggregateVersionRepoDbConfig.schema.head).values(head).run();
        db.insert(aggregateVersionRepoDbConfig.schema.services)
          .values({ serviceName: 'app', lastIndex: 0 })
          .run();
        const replicas = yield* Effect.forEach(
          ['prd_earlier', 'prd_target'] as const,
          resourceId =>
            makeModelMutations(product)
              .replicate({
                id: resourceId,
                modelName: product.modelName,
                version: product.version,
                createdAt: startedAt,
                updatedAt: startedAt,
                name: resourceId,
              })
              .pipe(
                Effect.map(mutation => ({
                  ...mutation,
                  operation: {
                    ...mutation.operation,
                    serviceVersion,
                    serviceIndex: 1,
                    resource: {
                      ...mutation.operation.resource,
                      serviceIndex: 1,
                    },
                  },
                })),
              ),
        );
        const [earlier, target] = replicas;
        if (earlier === undefined || target === undefined) {
          throw new Error('Missing prepared replica');
        }
        const reference = yield* makeModelMutations(productLink).create({
          resourceId: 'plk_one',
          attributes: { productId: 'prd_target' },
        });
        const mutations = yield* Effect.forEach(
          order === 'replica-first'
            ? [earlier, target, reference]
            : [earlier, reference, target],
          (mutation, mutationIndex) =>
            encodeMutation({ commandId: 'cmd_order', mutationIndex, mutation }),
        );
        const command = Schema.decodeUnknownSync(
          Schema.toType(AggregateChainedCommandSchema),
        )({
          id: 'cmd_order',
          commandName: 'createProductLink',
          payload: '{}',
          contractVersion: '1.0.0',
          aggregateId: 'usr_one',
          aggregateName: 'user',
          aggregateVersion: '1.0.0',
          systemName: 'test',
          actorName: 'test',
          actorVersion: '1.0.0',
          claims: { aggregateId: 'usr_one' },
          nodeId: null,
          nodeIndex: null,
          sessionName: null,
          aggregateIndex: 1,
          dispositionHash: null,
          admission: { status: 'succeeded', startedAt, completedAt: startedAt },
          execution: { status: 'pending' },
        });
        const context = yield* config.system.runtime.contextEffect;
        yield* executeCommandsTx(db, {
          head,
          aggregate: { ...aggregate, models },
          key: {
            systemId: 'sys_one',
            aggregateId: 'usr_one',
            aggregateName: 'user',
            aggregateVersion: '1.0.0',
          },
          preparedPage: [
            {
              command,
              startedAt,
              mutations,
              failure: null,
              contract: null,
              payload: null,
              guard: () => Effect.void,
            },
          ],
        }).pipe(Effect.provideContext(context));
        const retained =
          yield* aggregateVersionRepoDbConfig.tables.aggregateCommands.decodeRow(
            db
              .select()
              .from(aggregateVersionRepoDbConfig.schema.aggregateCommands)
              .get(),
          );
        if (order === 'replica-first') {
          expect(retained.execution.status).toBe('succeeded');
          const appliedRows = db
            .select()
            .from(aggregateVersionRepoDbConfig.schema.mutations)
            .all();
          expect(appliedRows.map(row => row.mutationIndex)).toEqual([0, 1, 2]);
          expect(appliedRows.map(row => row.operationName)).toEqual([
            'replicate',
            'replicate',
            'create',
          ]);
          expect(
            appliedRows.every(
              row => row.commandId === command.id && row.executedIndex === 1,
            ),
          ).toBe(true);
          expect(
            appliedRows.every(row => typeof row.inverseOperation === 'string'),
          ).toBe(true);
          expect(db.select().from(product.drizzleSchema).all()).toHaveLength(2);
          expect(
            db.select().from(productLink.drizzleSchema).all(),
          ).toMatchObject([{ id: 'plk_one', productId: 'prd_target' }]);
        } else {
          expect(retained.execution).toMatchObject({
            status: 'failed',
            failure: { code: 'mutation-referential-integrity-failed' },
          });
          expect(db.select().from(product.drizzleSchema).all()).toEqual([]);
          expect(db.select().from(productLink.drizzleSchema).all()).toEqual([]);
          expect(
            db
              .select()
              .from(aggregateVersionRepoDbConfig.schema.mutations)
              .all(),
          ).toEqual([]);
        }
        expect(
          db.select().from(aggregateVersionRepoDbConfig.schema.head).get(),
        ).toMatchObject({
          aggregateIndex: 1,
          executedIndex: 1,
        });
      }).pipe(Effect.scoped, Effect.provide(AsyncLive)),
    );
  },
);

it('retains admission rejection as skipped execution, and rolls back infrastructure failures', async () => {
  await Effect.runPromise(
    Effect.gen(function* () {
      const aggregate = config.system.aggregates['admission']?.['1.0.0'];
      if (aggregate === undefined) throw new Error('Missing aggregate fixture');
      const context = yield* config.system.runtime.contextEffect;
      const { db } = yield* makeActorSnapshotDb(aggregateVersionRepoDbConfig);
      const startedAt = new Date('2026-09-25T12:00:00Z');
      const failure = {
        _tag: 'ZerospinError' as const,
        code: 'unfamiliar-rejection',
        scope: 'actor' as const,
        message: 'Denied',
        status: 403,
        extra: { untouched: [1, 2] },
      };
      const command = Schema.decodeUnknownSync(
        Schema.toType(AggregateChainedCommandSchema),
      )({
        id: 'cmd_one',
        commandName: 'test',
        payload: '{}',
        contractVersion: '1.0.0',
        aggregateId: 'acct_one',
        aggregateName: 'admission',
        aggregateVersion: '1.0.0',
        systemName: 'test',
        actorName: 'direct',
        actorVersion: '1.0.0',
        claims: { aggregateId: 'acct_one', subject: 'one' },
        nodeId: null,
        nodeIndex: null,
        sessionName: null,
        aggregateIndex: 1,
        dispositionHash: null,
        admission: {
          status: 'failed',
          startedAt,
          completedAt: startedAt,
          failure,
        },
        execution: { status: 'pending' },
      });
      const head = {
        singletonId: 1,
        aggregateIndex: 0,
        executedIndex: 0,
        dispositionHash: genesisDispositionHash(),
      };
      db.insert(aggregateVersionRepoDbConfig.schema.head).values(head).run();
      let guarded = false;
      const props = {
        head,
        aggregate,
        key: {
          systemId: 'sys_one',
          aggregateId: 'acct_one',
          aggregateName: 'admission',
          aggregateVersion: '1.0.0',
        },
        preparedPage: [
          {
            command,
            startedAt,
            mutations: [],
            failure: null,
            contract: null,
            payload: null,
            guard: () =>
              Effect.sync(() => {
                guarded = true;
              }),
          },
        ],
      };
      yield* executeCommandsTx(db, props).pipe(Effect.provideContext(context));
      expect(guarded).toBe(false);
      const first = db
        .select()
        .from(aggregateVersionRepoDbConfig.schema.aggregateCommands)
        .get();
      const retained =
        yield* aggregateVersionRepoDbConfig.tables.aggregateCommands.decodeRow(
          first,
        );
      expect(retained.admission).toEqual(command.admission);
      expect(retained.execution).toEqual({
        status: 'skipped',
        reason: 'admission-failed',
      });
      const nextHead = db
        .select()
        .from(aggregateVersionRepoDbConfig.schema.head)
        .get();
      expect(nextHead).toMatchObject({ aggregateIndex: 1, executedIndex: 1 });
      const next = {
        ...command,
        id: 'cmd_two' as const,
        aggregateIndex: 2,
        admission: {
          status: 'succeeded' as const,
          startedAt,
          completedAt: startedAt,
        },
      };
      const interrupted = yield* executeCommandsTx(db, {
        ...props,
        head: nextHead,
        preparedPage: [
          {
            ...props.preparedPage[0],
            command: next,
            startedAt,
            mutations: [],
            failure: null,
            contract: null,
            payload: null,
            guard: () => Effect.fail(makeZerospinError('storage-unavailable')),
          },
        ],
      }).pipe(Effect.provideContext(context), Effect.result);
      expect(interrupted).toMatchObject({
        _tag: 'Failure',
        failure: { code: 'storage-unavailable' },
      });
      expect(
        db
          .select()
          .from(aggregateVersionRepoDbConfig.schema.aggregateCommands)
          .all(),
      ).toEqual([first]);
      expect(
        db.select().from(aggregateVersionRepoDbConfig.schema.head).get(),
      ).toEqual(nextHead);
      yield* executeCommandsTx(db, {
        ...props,
        head: nextHead,
        preparedPage: [
          {
            command: next,
            startedAt,
            mutations: [],
            failure,
            contract: null,
            payload: null,
            guard: () => Effect.void,
          },
        ],
      }).pipe(Effect.provideContext(context));
      const rows = db
        .select()
        .from(aggregateVersionRepoDbConfig.schema.aggregateCommands)
        .all();
      const rejected =
        yield* aggregateVersionRepoDbConfig.tables.aggregateCommands.decodeRow(
          rows[1],
        );
      expect(rejected.admission.status).toBe('succeeded');
      expect(rejected.execution).toMatchObject({
        status: 'failed',
        startedAt,
        failure,
      });
    }).pipe(Effect.scoped, Effect.provide(AsyncLive)),
  );
});
