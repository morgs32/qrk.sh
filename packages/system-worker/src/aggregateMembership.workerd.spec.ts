import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import { makeAuthenticationLock } from '@zerospin/core/authentication/makeAuthenticationLock';
import {
  AggregateExecutionEntrySchema,
  EncodedAggregateCommandSchema,
} from '@zerospin/core/contracts/CommandSchema';
import { makeAggregateFrontendLock } from '@zerospin/core/frontendController/makeAggregateFrontendLock';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { makeAbbreviationIdSchema } from '@zerospin/schema';
import {
  abortAllDurableObjects,
  env,
  listDurableObjectIds,
  runInDurableObject,
} from 'cloudflare:test';
import { Effect, Schema } from 'effect';
import { expect, it } from 'vitest';

import { AggregateChain } from './AggregateChain/AggregateChain.js';
import { AggregateFrontendApi } from './AggregateFrontendApi/AggregateFrontendApi.js';
import { AggregateFrontendApiFailure } from './AggregateFrontendApi/AggregateFrontendApiFailure/AggregateFrontendApiFailure.js';
import { authenticationSignature, main } from './fixtures/system.js';
import { GatewayApi } from './GatewayApi/GatewayApi.js';
import { makeSystemRuntime } from './makeSystemRuntime.js';
import { VersionedAggregateChain } from './VersionedAggregateChain/VersionedAggregateChain.js';
import { VersionedAggregateRepo } from './VersionedAggregateRepo/VersionedAggregateRepo.js';

it('preserves frontend authorization and repeated grants without registration', async () => {
  const runtime = makeSystemRuntime();
  try {
    const gateway = new GatewayApi({ runtime });
    const aggregateId = Schema.decodeUnknownSync(
      makeAbbreviationIdSchema('acct'),
    )('acct_discovery_auth');
    const request = {
      publishableKey: 'pk_discovery',
      systemName: 'system-worker',
      authenticationLock: makeAuthenticationLock(authenticationSignature),
      signature: { userId: 'usr_discovery_auth' },
      aggregateId,
      aggregateName: 'user',
      aggregateVersion: '1.0.0',
      frontendName: 'main',
      aggregateFrontendLock: makeAggregateFrontendLock({ frontend: main }),
    };
    const rejected = await gateway.getAggregateFrontendApi(request);
    expect(rejected).toBeInstanceOf(AggregateFrontendApiFailure);
    // Authorization reads VAR state; granting the capability needs no catalog write.
    const materializer = await runtime.runPromise(
      VersionedAggregateRepo.getRepo({
        key: {
          systemId: env.ZEROSPIN_SYSTEM_ID,
          aggregateId,
          aggregateName: 'user',
          aggregateVersion: '1.0.0',
        },
      }),
    );
    await runInDurableObject(materializer, (_instance, state) => {
      state.storage.sql.exec(
        'INSERT INTO user (id, modelName, createdAt, updatedAt, version, name) VALUES (?, ?, ?, ?, ?, ?)',
        'usr_discovery_auth',
        'user',
        1,
        1,
        '1.0.0',
        'Authorized user',
      );
    });
    expect(await gateway.getAggregateFrontendApi(request)).toBeInstanceOf(
      AggregateFrontendApi,
    );
    expect(await gateway.getAggregateFrontendApi(request)).toBeInstanceOf(
      AggregateFrontendApi,
    );
  } finally {
    await runtime.dispose();
  }
});

it('validates direct access and retains execution failures without registration', async () => {
  const runtime = makeSystemRuntime();
  try {
    const api = await new GatewayApi({ runtime }).getSystemApi({
      zerospinSecretKey: 'sk_discovery',
    });
    const aggregateId = Schema.decodeUnknownSync(
      makeAbbreviationIdSchema('acct'),
    )('acct_discovery_query');
    const query = {
      aggregateId,
      aggregateName: 'notes',
      aggregateVersion: '1.0.0',
      query: { method: 'all', params: [], rawSql: 'SELECT id FROM user' },
    } satisfies Parameters<typeof api.executeSelectQuery>[0]['args'][0];
    const malformed = { ...query, unexpected: true };
    expect(
      (await api.executeSelectQuery({ args: [malformed], traceContext: null }))
        .result._tag,
    ).toBe('Failure');
    expect(
      (
        await api.executeSelectQuery({
          args: [{ ...query, aggregateName: 'unknown' }],
          traceContext: null,
        })
      ).result._tag,
    ).toBe('Failure');
    expect(
      (await api.executeSelectQuery({ args: [query], traceContext: null }))
        .result,
    ).toEqual({ _tag: 'Success', success: [] });
    expect(
      (await api.executeSelectQuery({ args: [query], traceContext: null }))
        .result._tag,
    ).toBe('Success');

    const command = Schema.decodeUnknownSync(EncodedAggregateCommandSchema)({
      id: 'cmd_discovery_failure',
      aggregateId: 'acct_discovery_command',
      aggregateVersion: '1.0.0',
      aggregateName: 'user',
      systemName: 'system-worker',
      commandName: 'createList',
      contractVersion: '1.0.0',
      payload: JSON.stringify({
        id: 'lst_discovery_failure',
        userId: 'usr_discovery_failure',
        name: 'invalid-aggregate-name',
      }),
      userId: null,
      sessionId: null,
      frontendName: null,
      pushIndex: null,
    });
    expect(
      (
        await api.executeAggregateCommand({
          args: [
            {
              aggregateVersion: '1.0.0',
              command: { ...command, unexpected: true },
            },
          ],
          traceContext: null,
        })
      ).result._tag,
    ).toBe('Failure');
    expect(
      (
        await api.executeAggregateCommand({
          args: [
            {
              aggregateVersion: '1.0.0',
              command: { ...command, aggregateName: 'unknown' },
            },
          ],
          traceContext: null,
        })
      ).result._tag,
    ).toBe('Failure');
    expect(
      (
        await api.executeAggregateCommand({
          args: [
            {
              aggregateVersion: '1.0.0',
              command: { ...command, aggregateId: 'malformed' },
            },
          ],
          traceContext: null,
        })
      ).result._tag,
    ).toBe('Failure');
    const failedExecution = await api.executeAggregateCommand({
      args: [{ aggregateVersion: '1.0.0', command }],
      traceContext: null,
    });
    expect(failedExecution.result).toMatchObject({
      _tag: 'Success',
      success: { failure: { code: 'aggregate-list-name-rejected' } },
    });
  } finally {
    await runtime.dispose();
  }
});

it('delivers retained commands to deployed aggregate versions and resumes after cold activation', async () => {
  const runtime = makeSystemRuntime();
  const key = {
    systemId: env.ZEROSPIN_SYSTEM_ID,
    aggregateId: 'acct_discovery_delivery',
    aggregateName: 'notes',
  };
  const command = Schema.decodeUnknownSync(EncodedAggregateCommandSchema)({
    id: 'cmd_discovery_delivery',
    aggregateId: key.aggregateId,
    aggregateVersion: '1.0.0',
    aggregateName: key.aggregateName,
    systemName: 'system-worker',
    commandName: 'createUser',
    contractVersion: '1.0.0',
    payload: JSON.stringify({
      id: 'usr_discovery_delivery',
      name: 'Delivered autonomously',
    }),
    userId: null,
    sessionId: null,
    frontendName: null,
    pushIndex: null,
  });
  try {
    const chain = await runtime.runPromise(AggregateChain.getRepo({ key }));
    const admitted = await runtime.runPromise(
      makeAsync(() => chain.admitCommands({ commands: [command] })).pipe(
        Effect.flatMap(decodeRpc),
      ),
    );
    expect(admitted).toEqual([{ commandId: command.id, aggregateIndex: 1 }]);
    await expect
      .poll(
        async () => {
          const subscribers = await runtime.runPromise(
            makeAsync(() =>
              chain.getRepoTableRows({
                tableName: 'versionedAggregateRepos',
              }),
            ).pipe(Effect.flatMap(decodeRpc)),
          );
          return subscribers.rows.map(row => row.aggregateVersion).sort();
        },
        { timeout: 10_000 },
      )
      .toEqual(['0.8.0', '0.9.0', '1.0.0']);

    // Read retained output only; no explicit VAR execution, catch-up, or delivery.
    for (const aggregateVersion of ['0.8.0', '0.9.0', '1.0.0']) {
      const history = await runtime.runPromise(
        VersionedAggregateChain.getRepo({
          key: { ...key, aggregateVersion },
        }),
      );
      await expect
        .poll(
          async () => {
            const page = await runtime.runPromise(
              makeAsync(async () =>
                (await history.replicaFanoutQueue).getPage({ afterIndex: 0 }),
              ).pipe(Effect.flatMap(decodeRpc)),
            );
            return page.rows.length;
          },
          { timeout: 10_000 },
        )
        .toBe(1);
      const page = await runtime.runPromise(
        makeAsync(async () =>
          (await history.replicaFanoutQueue).getPage({ afterIndex: 0 }),
        ).pipe(Effect.flatMap(decodeRpc)),
      );
      const entry = Schema.decodeUnknownSync(
        Schema.fromJsonString(AggregateExecutionEntrySchema),
      )(page.rows[0]!.entry);
      expect(JSON.parse(entry.sourceCommand)).toEqual(command);
      expect(entry.mutations).toHaveLength(1);
    }
    await abortAllDurableObjects();
    const reopenedChain = await runtime.runPromise(
      AggregateChain.getRepo({ key }),
    );
    const next = {
      ...command,
      id: Schema.decodeUnknownSync(makeAbbreviationIdSchema('cmd'))(
        'cmd_discovery_recovered',
      ),
      payload: JSON.stringify({
        id: 'usr_discovery_recovered',
        name: 'Recovered autonomously',
      }),
    };
    const receipts = await runtime.runPromise(
      makeAsync(() => reopenedChain.admitCommands({ commands: [next] })).pipe(
        Effect.flatMap(decodeRpc),
      ),
    );
    expect(receipts).toEqual([{ commandId: next.id, aggregateIndex: 2 }]);
    for (const aggregateVersion of ['0.8.0', '0.9.0', '1.0.0']) {
      const history = await runtime.runPromise(
        VersionedAggregateChain.getRepo({
          key: { ...key, aggregateVersion },
        }),
      );
      await expect
        .poll(
          async () => {
            const page = await Effect.runPromise(
              makeAsync(async () =>
                (await history.replicaFanoutQueue).getPage({ afterIndex: 1 }),
              ).pipe(Effect.flatMap(decodeRpc), Effect.provide(AsyncLive)),
            );
            return page.rows.map(
              row =>
                Schema.decodeUnknownSync(
                  Schema.fromJsonString(AggregateExecutionEntrySchema),
                )(row.entry).command.id,
            );
          },
          { timeout: 10_000 },
        )
        .toEqual([next.id]);
    }
  } finally {
    await runtime.dispose();
  }
});

it('enrolls an empty AC during activation without opening any VARs', async () => {
  const runtime = makeSystemRuntime();
  try {
    const before = await listDurableObjectIds(env.VERSIONED_AGGREGATE_REPO);
    const key = {
      systemId: env.ZEROSPIN_SYSTEM_ID,
      aggregateId: 'acct_empty_feed',
      aggregateName: 'notes',
    };
    const chain = await runtime.runPromise(AggregateChain.getRepo({ key }));
    await chain.ready();
    const destinations = await runtime.runPromise(
      makeAsync(() =>
        chain.getRepoTableRows({
          tableName: 'versionedAggregateRepos',
        }),
      ).pipe(Effect.flatMap(decodeRpc)),
    );
    expect(destinations.rows.map(row => row.aggregateVersion).sort()).toEqual([
      '0.8.0',
      '0.9.0',
      '1.0.0',
    ]);
    const after = await listDurableObjectIds(env.VERSIONED_AGGREGATE_REPO);
    expect(after.map(id => id.toString()).sort()).toEqual(
      before.map(id => id.toString()).sort(),
    );
  } finally {
    await runtime.dispose();
  }
});
