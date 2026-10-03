import assert from 'node:assert/strict';

import { AggregateChainedCommandSchema } from '@zerospin/core/contracts/CommandSchema';
import { defineContract } from '@zerospin/core/contracts/defineContract';
import { makeContractVersion } from '@zerospin/core/contracts/make/makeContractVersion';
import { makeResourceDbConfig } from '@zerospin/core/drizzle/make/makeDbConfig/makeDbConfig';
import { makeProvisionedInMemorySqljsDb } from '@zerospin/core/drizzle/make/makeProvisionedInMemorySqljsDb/makeProvisionedInMemorySqljsDb';
import { primitives } from '@zerospin/schema';
import { Effect, Result, Schema } from 'effect';

import { admitCommandsTx } from '../AggregateChain/admitCommands/admitCommandsTx.js';
import { aggregateChainDbConfig } from '../AggregateChain/aggregateChainDbConfig.js';
import { genesisDispositionHash } from '../aggregateDispositionHash/aggregateDispositionHash.js';
import { aggregateVersionRepoDbConfig } from '../AggregateVersionRepo/aggregateVersionRepoDbConfig.js';
import { executeCommandsTx as executeAggregate } from '../AggregateVersionRepo/executeCommands/executeCommandsTx.js';
import { prepareAdmissionResult } from '../checkAdmission.js';
import { retainServiceCommand } from '../ServiceChain/admitServiceCommand/retainServiceCommand.js';
import { serviceChainDbConfig } from '../ServiceChain/serviceChainDbConfig.js';
import { executeCommandsTx as executeService } from '../ServiceVersionRepo/executeCommands/executeCommandsTx.js';
import { serviceVersionRepoDbConfig } from '../ServiceVersionRepo/serviceVersionRepoDbConfig.js';

/** Real admission validation rejects input, then the normal materializers retain a skipped execution. */
export const verifyAdmissionTerminal = Effect.fn('verifyAdmissionTerminal')(
  function* () {
    const contract = makeContractVersion(defineContract('change'), {
      version: '1.0.0',
      payload: { value: primitives.number() },
    });
    const command = {
      id: 'cmd_admission' as const,
      asyncInput: null,
      commandName: 'change',
      contractVersion: '1.0.0',
      payload: '{"value":"invalid"}',
      aggregateId: 'agg_one',
      aggregateName: 'account',
      systemName: 'fixture',
      actorName: 'owner',
      actorVersion: '1.0.0',
      claims: { aggregateId: 'agg_one' },
      nodeId: 'node_one',
      nodeIndex: 1,
      sessionName: 'owner',
    };
    const admission = yield* prepareAdmissionResult({
      command,
      claims: null,
      owners: [{ contracts: [contract] }],
      startedAt: new Date(0),
    });
    assert.equal(admission.status, 'failed');
    const db = yield* makeProvisionedInMemorySqljsDb({
      dbConfig: aggregateChainDbConfig,
    });
    const prepared = { command, admission, originalExecutionVersion: '1.0.0' };
    const first = yield* admitCommandsTx(db, [prepared]);
    assert.deepEqual(yield* admitCommandsTx(db, [prepared]), first);
    const versionDb = yield* makeProvisionedInMemorySqljsDb({
      dbConfig: makeResourceDbConfig({
        models: {},
        otherTables: aggregateVersionRepoDbConfig.tables,
      }),
    });
    const head = {
      singletonId: 1,
      aggregateIndex: 0,
      executedIndex: 0,
      dispositionHash: genesisDispositionHash(),
    };
    versionDb
      .insert(aggregateVersionRepoDbConfig.schema.head)
      .values(head)
      .run();
    yield* executeAggregate(versionDb, {
      head,
      aggregate: {
        name: 'account',
        version: '1.0.0',
        models: {},
        actors: {},
        contracts: {},
        guards: {},
      },
      key: {
        systemId: 'fixture',
        aggregateId: 'agg_one',
        aggregateName: 'account',
        aggregateVersion: '1.0.0',
      },
      preparedPage: [
        {
          command: Schema.decodeUnknownSync(
            Schema.toType(AggregateChainedCommandSchema),
          )({
            ...first[0],
            execution: { status: 'pending' },
            dispositionHash: null,
          }),
          originalExecutionVersion: '1.0.0',
          startedAt: new Date(1),
          operations: [],
          encodedResult: null,
          contractVersion: '1.0.0',
          failure: null,
          contract: null,
          payload: null,
          guard: () =>
            Effect.sync(() =>
              assert.fail('Rejected admission must not run the guard'),
            ),
        },
      ],
    });
    const aggregateRow = versionDb
      .select()
      .from(aggregateVersionRepoDbConfig.schema.executedCommandOutbox)
      .get();
    assert.ok(aggregateRow);
    assert.equal(JSON.parse(aggregateRow.execution).status, 'skipped');
    assert.equal(JSON.parse(aggregateRow.admission).status, 'failed');
    assert.equal(aggregateRow.id, command.id);

    const serviceCommand = {
      id: 'cmd_service_rejected' as const,
      asyncInput: null,
      commandName: 'change',
      contractVersion: '1.0.0',
      payload: command.payload,
      serviceName: 'service',
      serviceVersion: '1.0.0',
      caller: null,
    };
    const serviceAdmission = yield* prepareAdmissionResult({
      command: serviceCommand,
      claims: null,
      owners: [{ contracts: [contract] }],
      startedAt: new Date(0),
    });
    const chainDb = yield* makeProvisionedInMemorySqljsDb({
      dbConfig: serviceChainDbConfig,
    });
    const retained = yield* retainServiceCommand({
      db: chainDb,
      command: serviceCommand,
      admission: serviceAdmission,
    });
    assert.deepEqual(
      yield* retainServiceCommand({
        db: chainDb,
        command: serviceCommand,
        admission: serviceAdmission,
      }),
      retained,
    );
    const serviceDb = yield* makeProvisionedInMemorySqljsDb({
      dbConfig: makeResourceDbConfig({
        models: {},
        otherTables: serviceVersionRepoDbConfig.tables,
      }),
    });
    yield* executeService(serviceDb, {
      cursor: 0,
      key: {
        systemId: 'fixture',
        serviceName: 'service',
        serviceVersion: '1.0.0',
      },
      service: {
        name: 'service',
        version: '1.0.0',
        models: {},
        actors: {},
        contracts: { change: contract },
        queries: {},
      },
      inputs: [
        {
          command: {
            ...retained,
            execution: { status: 'pending' as const },
            admission: serviceAdmission,
            dispositionHash: null,
          },
          startedAt: new Date(1),
          prepared: Result.succeed({
            contractVersion: '1.0.0',
            payload: null,
            operations: [],
            encodedResult: null,
          }),
        },
      ],
    });
    const serviceRow = serviceDb
      .select()
      .from(serviceVersionRepoDbConfig.schema.commands)
      .get();
    assert.ok(serviceRow);
    assert.equal(JSON.parse(serviceRow.execution).status, 'skipped');
    assert.equal(JSON.parse(serviceRow.admission).status, 'failed');
    assert.equal(serviceRow.id, serviceCommand.id);
  },
);
