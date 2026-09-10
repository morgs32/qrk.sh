import { NanoIdFactory } from '@zerospin/core/utils/NanoIdFactory';
import { UlidMonotonicFactory } from '@zerospin/core/utils/UlidMonotonicFactory';
import {
  Context,
  Effect,
  Layer,
  ManagedRuntime,
  Redacted,
  Scope,
} from 'effect';
import { assert, type Equals } from 'tsafe';

import { main } from '../fixtures/system.ts';
import { makeFrontendController } from '../frontendController/makeFrontendController.ts';
import { PublishableKey } from '../services/PublishableKey.ts';

import { makeAggregateSession } from './makeAggregateSession.ts';
const guardTestRuntime = ManagedRuntime.make(
  Layer.mergeAll(NanoIdFactory, UlidMonotonicFactory),
);

const sessionScope = Scope.makeUnsafe();
Effect.runSync(
  Scope.addFinalizer(sessionScope, guardTestRuntime.disposeEffect),
);

const session = Effect.runSync(
  Effect.map(
    {
      ...main,
      contracts: {
        createList: { contract: main.contracts.createList.contract },
      },
    }.initializeGuards,
    guards =>
      makeAggregateSession({
        runtime: guardTestRuntime,
        guards,
        frontend: {
          ...main,
          contracts: {
            createList: { contract: main.contracts.createList.contract },
          },
        },
        sessionId: 'sesn_typing',
      }),
  ).pipe(Effect.provideService(Scope.Scope, sessionScope)),
);

const result = session.executeCommand({
  contractName: 'createList',
  payload: { id: 'lst_typing', name: 'Typed list', userId: 'usr_typing' },
});
assert<
  Equals<
    Extract<typeof result, { _tag: 'Success' }>['success']['contractVersion'],
    '1.0.0'
  >
>();

session.executeCommand({
  contractName: 'createList',
  // @ts-expect-error The public session API retains contract-specific payload validation.
  payload: { id: 'lst_typing', name: 123, userId: 'usr_typing' },
});
session.executeCommand({
  // @ts-expect-error Only contracts mounted on this frontend can be executed.
  contractName: 'missingContract',
  payload: { id: 'lst_typing', name: 'Typed list', userId: 'usr_typing' },
});

// The constructor borrows a runtime; initializing guards remains the caller's work.
// @ts-expect-error A runtime is required, even for a frontend without local dependencies.
makeAggregateSession({
  frontend: main,
  sessionId: 'sesn_no_runtime',
  guards: { context: Context.empty(), run: () => Effect.void },
});
// @ts-expect-error Uninitialized frontend layers are not a ready guard context.
makeAggregateSession({
  frontend: main,
  sessionId: 'sesn_no_guards',
  runtime: guardTestRuntime,
});
const localFrontend = makeFrontendController({
  systemName: 'test',
  aggregateName: 'account',
  aggregateVersion: '1.0.0',
  name: 'guarded',
  models: {},
  contracts: {},
  layer: Layer.succeed(PublishableKey, Redacted.make('local')),
});
assert<Equals<Layer.Success<typeof localFrontend.layer>, PublishableKey>>();
const localGuards = Effect.runSync(
  localFrontend.initializeGuards.pipe(
    Effect.provideService(Scope.Scope, sessionScope),
  ),
);
makeAggregateSession({
  frontend: localFrontend,
  sessionId: 'sesn_initialized',
  runtime: guardTestRuntime,
  guards: localGuards,
});

const emptyRuntime = ManagedRuntime.make(Layer.empty);
makeAggregateSession({
  frontend: main,
  sessionId: 'sesn_missing_runtime_services',
  guards: localGuards,
  // @ts-expect-error The borrowed runtime must supply framework command ID and timestamp services.
  runtime: emptyRuntime,
});
