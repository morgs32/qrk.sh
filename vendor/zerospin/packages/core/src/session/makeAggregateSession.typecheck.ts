import { main as authenticationFixtureFrontend } from '@zerospin/core/fixtures/system';
import { NanoIdFactory } from '@zerospin/core/utils/NanoIdFactory';
import { UlidMonotonicFactory } from '@zerospin/core/utils/UlidMonotonicFactory';
import {
  Effect,
  Layer,
  ManagedRuntime,
  Redacted,
  Scope,
} from 'effect';
import { assert, type Equals } from 'tsafe';

import { List, main, User } from '../fixtures/system.ts';
import { initializeGuards as initializeFrontendGuards } from '../frontendController/initializeGuards.ts';
import { makeFrontendController } from '../frontendController/makeFrontendController.ts';
import { PublishableKey } from '../services/PublishableKey.ts';

import { makeAggregateSession } from './makeAggregateSession.ts';
import { stageCommand } from './stageCommand.ts';

const guardTestRuntime = ManagedRuntime.make(
  Layer.mergeAll(NanoIdFactory, UlidMonotonicFactory),
);

const sessionScope = Scope.makeUnsafe();
Effect.runSync(
  Scope.addFinalizer(sessionScope, guardTestRuntime.disposeEffect),
);

const frontend = {
  ...main,
  contracts: {
    createList: { contract: main.contracts.createList.contract },
  },
};

const session = makeAggregateSession({ frontend });
const guards = Effect.runSync(
  initializeFrontendGuards({ frontend }).pipe(
    Effect.provideService(Scope.Scope, sessionScope),
  ),
);
session.setExecutionResources({
  sessionId: 'sesn_typing',
  guards,
  runtime: guardTestRuntime,
});

const userId = session.makeId(User);
const listId = session.makeId(List);
assert<Equals<typeof userId, `usr_${string}`>>();
assert<Equals<typeof listId, `lst_${string}`>>();

const result = stageCommand({
  session,
  contractName: 'createList',
  payload: { id: 'lst_typing', name: 'Typed list', userId: 'usr_typing' },
});
assert<
  Equals<
    Extract<typeof result, { _tag: 'Success' }>['success']['contractVersion'],
    '1.0.0'
  >
>();

stageCommand({
  session,
  contractName: 'createList',
  // @ts-expect-error The public session API retains contract-specific payload validation.
  payload: { id: 'lst_typing', name: 123, userId: 'usr_typing' },
});
stageCommand({
  session,
  // @ts-expect-error Only contracts mounted on this frontend can be staged.
  contractName: 'missingContract',
  payload: { id: 'lst_typing', name: 'Typed list', userId: 'usr_typing' },
});

const unbound = makeAggregateSession({ frontend: main });
// @ts-expect-error A runtime is required when binding execution resources.
unbound.setExecutionResources({
  sessionId: 'sesn_no_runtime',
  guards,
});
// @ts-expect-error Uninitialized frontend layers are not a ready guard context.
unbound.setExecutionResources({
  sessionId: 'sesn_no_guards',
  runtime: guardTestRuntime,
});

const localLayer = Layer.succeed(PublishableKey, Redacted.make('local'));
const localFrontend = makeFrontendController({
  authenticationSchema:
    authenticationFixtureFrontend.authentication.authenticationSchema,
  systemName: 'test',
  aggregateName: 'account',
  aggregateVersion: '1.0.0',
  name: 'guarded',
  models: {},
  contracts: {},
});
const localGuards = Effect.runSync(
  initializeFrontendGuards({ frontend: localFrontend, layer: localLayer }).pipe(
    Effect.provideService(Scope.Scope, sessionScope),
  ),
);
const initialized = makeAggregateSession({ frontend: localFrontend });
initialized.setExecutionResources({
  sessionId: 'sesn_initialized',
  runtime: guardTestRuntime,
  guards: localGuards,
});

const emptyRuntime = ManagedRuntime.make(Layer.empty);
const missingServices = makeAggregateSession({ frontend: main });
missingServices.setExecutionResources({
  sessionId: 'sesn_missing_runtime_services',
  guards: localGuards,
  // @ts-expect-error The borrowed runtime must supply framework command ID and timestamp services.
  runtime: emptyRuntime,
});
