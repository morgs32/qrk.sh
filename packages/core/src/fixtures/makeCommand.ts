import assert from 'node:assert/strict';

import { RoutePattern } from '@remix-run/route-pattern';
import { CuidFactory, primitives } from '@zerospin/shapes';
import { Cause, Effect, Exit, Option, Schema } from 'effect';

import { defineAggregate } from '../aggregate/defineAggregate.ts';
import { makeAggregateVersion } from '../aggregate/make/makeAggregateVersion.ts';
import { defineAggregateActor } from '../aggregateActor/defineAggregateActor.ts';
import { makeAggregateActorVersion } from '../aggregateActor/make/makeAggregateActorVersion/makeAggregateActorVersion.ts';
import {
  EncodedAggregateCommandSchema,
  EncodedServiceCommandSchema,
} from '../contracts/CommandSchema.ts';
import { defineContract } from '../contracts/defineContract.ts';
import { makeContractVersion } from '../contracts/make/makeContractVersion.ts';
import { makeActorIdentity } from '../identity/make/makeActorIdentity/makeActorIdentity.ts';
import { makeCommand } from '../makeCommand.ts';
import { makeActorDbVersion } from '../models/make/makeActorDbVersion.ts';
import { defineService } from '../service/defineService.ts';
import { makeServiceVersion } from '../service/make/makeServiceVersion.ts';

const change = makeContractVersion(defineContract('change'), {
  version: '1.0.0',
  payload: { name: primitives.text() },
  models: {},
  program: () => Effect.void,
});
const owner = makeAggregateActorVersion(
  defineAggregateActor({ name: 'owner' }),
  {
    version: '1.0.0',
    authentication: 'none',
    identity: makeActorIdentity({
      claims: Schema.Struct({
        aggregateId: Schema.String,
        subject: Schema.String,
      }),
      actorPath: RoutePattern.parse('/:subject'),
    }),
    db: makeActorDbVersion({ models: {} }),
    contracts: { change },
    selections: {},
  },
);
const aggregate = makeAggregateVersion(defineAggregate({ name: 'account' }), {
  version: '1.0.0',
  models: {},
  contracts: { change },
  actors: { owner },
});
const service = makeServiceVersion(defineService({ name: 'catalog' }), {
  version: '1.0.0',
  models: {},
  contracts: { change },
});
const factory = () => Effect.succeed('fixture');

const serviceCommand = await Effect.runPromise(
  makeCommand(service, {
    contractName: 'change',
    payload: { name: 'service change' },
  }).pipe(Effect.provideService(CuidFactory, factory)),
);
assert.equal(serviceCommand.caller, null);
const encodedServiceCommand = Schema.decodeUnknownSync(
  EncodedServiceCommandSchema,
  {
    onExcessProperty: 'error',
  },
)({ ...serviceCommand, payload: JSON.stringify(serviceCommand.payload) });
assert.equal(encodedServiceCommand.serviceName, 'catalog');
assert.equal(encodedServiceCommand.caller, null);

const aggregateCommand = await Effect.runPromise(
  makeCommand(aggregate, {
    contractName: 'change',
    actorName: 'owner',
    claims: { aggregateId: 'acct_one', subject: 'one' },
    aggregateId: 'acct_one',
    systemName: 'fixture',
    payload: { name: 'aggregate change' },
  }).pipe(Effect.provideService(CuidFactory, factory)),
);
// Property access verifies the public aggregate overload retains the direct-command result type.
assert.equal(aggregateCommand.aggregateName, 'account');
assert.equal(aggregateCommand.aggregateVersion, '1.0.0');
assert.equal(aggregateCommand.actorName, 'owner');
assert.equal(aggregateCommand.nodeId, null);
assert.equal(aggregateCommand.nodeIndex, null);
assert.equal(aggregateCommand.sessionName, null);
const encodedAggregateCommand = Schema.decodeUnknownSync(
  EncodedAggregateCommandSchema,
  {
    onExcessProperty: 'error',
  },
)({ ...aggregateCommand, payload: JSON.stringify(aggregateCommand.payload) });
assert.equal(encodedAggregateCommand.aggregateId, 'acct_one');
assert.deepEqual(encodedAggregateCommand.claims, {
  aggregateId: 'acct_one',
  subject: 'one',
});

const mismatch = await Effect.runPromise(
  makeCommand(aggregate, {
    contractName: 'change',
    actorName: 'owner',
    claims: { aggregateId: 'acct_one', subject: 'one' },
    aggregateId: 'acct_two',
    systemName: 'fixture',
    payload: { name: 'forbidden change' },
  }).pipe(Effect.provideService(CuidFactory, factory), Effect.exit),
);
assert(Exit.isFailure(mismatch));
const failure = Cause.findErrorOption(mismatch.cause);
assert(Option.isSome(failure));
assert.equal(failure.value.code, 'aggregate-command-target-mismatch');
console.log('Direct aggregate and service command provenance checks passed.');
