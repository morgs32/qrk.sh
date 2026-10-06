import assert from 'node:assert/strict';

import { ServiceTerminalCommandSchema } from '@zerospin/core/contracts/CommandSchema';
import { makeResourceDbConfig } from '@zerospin/core/drizzle/make/makeDbConfig/makeDbConfig';
import { makeProvisionedInMemorySqljsDb } from '@zerospin/core/drizzle/make/makeProvisionedInMemorySqljsDb/makeProvisionedInMemorySqljsDb';
import { defineModel } from '@zerospin/core/models/defineModel';
import { makeModelVersion } from '@zerospin/core/models/make/makeModelVersion';
import type { IAnyService } from '@zerospin/core/service/types';
import { makeRpcEnvelope } from '@zerospin/logger';
import { primitives } from '@zerospin/shapes';
import { Effect, Schema } from 'effect';

import {
  forwardCommand,
  validateForwardedCommand,
} from '../forwardedCommands.js';
import { executeTx as projectServiceTx } from '../ServiceActorVersionRepo/execute/executeTx.js';
import { serviceActorVersionRepoDbConfig } from '../ServiceActorVersionRepo/serviceActorVersionRepoDbConfig.js';
import {
  advanceDispositionHash,
  genesisDispositionHash,
} from '../serviceDispositionHash/serviceDispositionHash.js';
import { receiveExecutedCommands } from '../ServiceVersionChain/receiveExecutedCommands/receiveExecutedCommands.js';
import { serviceVersionChainDbConfig } from '../ServiceVersionChain/serviceVersionChainDbConfig.js';
import { flush } from '../ServiceVersionRepo/flush/flush.js';
import { serviceVersionRepoDbConfig } from '../ServiceVersionRepo/serviceVersionRepoDbConfig.js';

export const verifyCommandForwarding = Effect.fn('verifyCommandForwarding')(
  function* () {
    const product = makeModelVersion(
      defineModel({ name: 'product', abbreviation: 'prd' }),
      {
        version: '1.0.0',
        attributes: { name: primitives.text(), price: primitives.number() },
        indexes: [],
      },
    );
    const source: IAnyService = {
      name: 'catalog',
      version: '1.0.0',
      models: { product },
      actors: {},
      contracts: {},
      queries: {},
    };
    const origin = {
      id: 'cmd_original',
      commandName: 'createProduct',
      payload: '{"input":"original"}',
      response: null,
      contractVersion: '1.0.0',
      caller: null,
      serviceName: 'catalog',
      serviceVersion: '1.0.0',
      serviceIndex: 1,
      executedIndex: 1,
      executionVersion: '1.0.0',
      dispositionHash: '0'.repeat(64),
      admission: JSON.stringify({
        status: 'succeeded',
        startedAt: new Date(0),
        completedAt: new Date(1),
      }),
      execution: JSON.stringify({
        status: 'succeeded',
        startedAt: new Date(1),
        completedAt: new Date(2),
        contractVersion: '1.0.0',
        result: { retained: true },
      }),
    };
    const operation = {
      serviceIndex: 1,
      commandId: origin.id,
      operationIndex: 0,
      modelName: 'product',
      modelVersion: '1.0.0',
      resourceId: 'prd_one',
      operationName: 'create' as const,
      body: JSON.stringify({ encodedAttributes: { name: 'One', price: 10 } }),
      committedAt: new Date(2),
    };
    yield* validateForwardedCommand(origin);
    const pendingOriginal = yield* validateForwardedCommand({
      ...origin,
      execution: JSON.stringify({ status: 'pending' }),
    }).pipe(Effect.result);
    assert.equal(pendingOriginal._tag, 'Failure');
    const rejectedWithSuccess = yield* validateForwardedCommand({
      ...origin,
      admission: JSON.stringify({
        status: 'failed',
        startedAt: new Date(0),
        completedAt: new Date(1),
        failure: {
          _tag: 'ZerospinError',
          code: 'rejected',
          message: 'rejected',
          status: null,
          extra: null,
        },
      }),
    }).pipe(Effect.result);
    assert.equal(rejectedWithSuccess._tag, 'Failure');
    const missingOwner = yield* validateForwardedCommand({
      ...origin,
      serviceName: '',
    }).pipe(Effect.result);
    assert.equal(missingOwner._tag, 'Failure');
    const flushDb = yield* makeProvisionedInMemorySqljsDb({
      dbConfig: serviceVersionRepoDbConfig,
    });
    const flushHistory = yield* makeProvisionedInMemorySqljsDb({
      dbConfig: serviceVersionChainDbConfig,
    });
    const firstCommand = {
      ...origin,
      serviceIndex: 1,
      executedIndex: 1,
      dispositionHash: advanceDispositionHash({
        previousDispositionHash: genesisDispositionHash(),
        commandId: origin.id,
        serviceIndex: 1,
        disposition: 'success',
        failure: null,
      }),
    };
    const projectionDb = yield* makeProvisionedInMemorySqljsDb({
      dbConfig: makeResourceDbConfig({
        models: source.models,
        otherTables: serviceActorVersionRepoDbConfig.tables,
      }),
    });
    const projection = {
      service: source,
      key: {
        systemId: 'fixture',
        serviceName: source.name,
        serviceVersion: source.version,
        actorName: '__service',
        actorVersion: source.version,
        actorPath: '/',
      },
      rows: [
        {
          kind: 'command' as const,
          executedIndex: 1,
          command: firstCommand,
          operations: [operation],
        },
      ],
    };
    yield* projectServiceTx(projectionDb, projection);
    assert.equal(
      projectionDb.select().from(product.drizzleSchema).get()?.id,
      'prd_one',
    );
    assert.equal(
      projectionDb
        .select()
        .from(serviceActorVersionRepoDbConfig.schema.actorState)
        .get()?.executedIndex,
      1,
    );
    assert.equal(
      projectionDb
        .select()
        .from(serviceActorVersionRepoDbConfig.schema.browserCommandOutbox)
        .all().length,
      1,
    );
    yield* projectServiceTx(projectionDb, projection);
    assert.equal(
      projectionDb
        .select()
        .from(serviceActorVersionRepoDbConfig.schema.browserCommandOutbox)
        .all().length,
      1,
    );
    const invalidPage = yield* projectServiceTx(projectionDb, {
      ...projection,
      rows: [
        {
          ...projection.rows[0]!,
          executedIndex: 2,
          command: {
            ...firstCommand,
            id: 'cmd_second',
            serviceIndex: 2,
            executedIndex: 2,
          },
          operations: [
            {
              ...operation,

              commandId: 'cmd_second',
              serviceIndex: 2,
              resourceId: 'prd_two',
            },
            {
              ...operation,

              commandId: 'cmd_second',
              serviceIndex: 2,
              operationIndex: 1,
              resourceId: 'prd_missing',
              operationName: 'delete' as const,
              body: '{}',
            },
          ],
        },
      ],
    }).pipe(Effect.result);
    assert.equal(invalidPage._tag, 'Failure');
    assert.equal(
      projectionDb.select().from(product.drizzleSchema).all().length,
      1,
    );
    assert.equal(
      projectionDb
        .select()
        .from(serviceActorVersionRepoDbConfig.schema.actorState)
        .get()?.executedIndex,
      1,
    );
    assert.equal(
      projectionDb
        .select()
        .from(serviceActorVersionRepoDbConfig.schema.browserCommandOutbox)
        .all().length,
      1,
    );
    console.log('PASS owned actor projection, retry and whole-page rollback');
    flushDb
      .insert(serviceVersionRepoDbConfig.schema.commands)
      .values(firstCommand)
      .run();
    flushDb
      .insert(serviceVersionRepoDbConfig.schema.executedCommandOutbox)
      .values({
        ...forwardCommand(firstCommand),
        serviceIndex: 1,
        executedIndex: 1,
        lastDeliveryFailure: null,
      })
      .run();
    let flushDeliveries = 0;
    const flushProps = {
      serviceIndex: 1,
      db: flushDb,
      key: {
        systemId: 'fixture',
        serviceName: 'catalog',
        serviceVersion: '1.0.0',
      },
      repo: {
        execute: () =>
          Effect.runPromise(
            serviceVersionRepoDbConfig.tables.commands
              .decodeRow(firstCommand)
              .pipe(
                Effect.flatMap(
                  Schema.decodeUnknownEffect(
                    Schema.toType(ServiceTerminalCommandSchema),
                  ),
                ),
                makeRpcEnvelope,
              ),
          ),
      },
      chain: {
        getServiceResult: () =>
          Effect.runPromise(
            Effect.sync(() =>
              flushHistory
                .select()
                .from(serviceVersionChainDbConfig.schema.commands)
                .get(),
            ).pipe(makeRpcEnvelope),
          ),
      },
      executedCommandOutbox: {
        drain: () =>
          Effect.gen(function* () {
            flushDeliveries++;
            yield* receiveExecutedCommands({
              db: flushHistory,
              key: { serviceName: 'catalog', serviceVersion: '1.0.0' },
              rows: [
                { kind: 'command', command: firstCommand, operations: [] },
              ],
            });
            flushDb
              .delete(serviceVersionRepoDbConfig.schema.executedCommandOutbox)
              .run();
            flushDb.delete(serviceVersionRepoDbConfig.schema.commands).run();
            return undefined;
          }),
      },
    };
    const flushed = yield* flush(flushProps);
    assert.equal(flushed.commandId, origin.id);
    assert.deepEqual(yield* flush(flushProps), flushed);
    assert.equal(flushDeliveries, 1);
    assert.equal(
      flushDb
        .select()
        .from(serviceVersionRepoDbConfig.schema.executedCommandOutbox)
        .all().length,
      0,
    );
    console.log(
      'PASS: repeated service flush uses durable receiving history after outbox deletion',
    );
  },
);
