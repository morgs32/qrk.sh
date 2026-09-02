import {
  Context,
  Effect,
  Layer,
  ManagedRuntime,
  Schema,
  type Fiber,
  type Stream,
} from 'effect';

import { makeMachine } from '../makeMachine/makeMachine.js';
import { makeState } from '../makeState/makeState.js';
import type { StateInactive } from '../StateInactive.js';
import type {
  IMachineActor,
  InferMachineStateHandle,
  InferMachineValue,
  InferStateHandle,
  IStateHandle,
} from '../types.js';

import { makeActor } from './makeActor.js';

type IEqual<LEFT, RIGHT> =
  (<TYPE>() => TYPE extends LEFT ? 1 : 2) extends <TYPE>() => TYPE extends RIGHT
    ? 1
    : 2
    ? true
    : false;
type IExpect<VALUE extends true> = VALUE;

const Idle = makeState({
  stateName: 'idle',
  input: { draft: Schema.String },
});
const Editing = makeState({
  stateName: 'editing',
  input: { draft: Schema.String, revision: Schema.Int },
});

class Prefix extends Context.Service<Prefix, { readonly value: string }>()(
  'actor-typecheck/Prefix',
) {}

class LayerConfig extends Context.Service<
  LayerConfig,
  { readonly value: string }
>()('actor-typecheck/LayerConfig') {}

class ExtraService extends Context.Service<
  ExtraService,
  { readonly value: number }
>()('actor-typecheck/ExtraService') {}

class StatePersistence extends Context.Service<
  StatePersistence,
  {
    readonly save: (transition: {
      readonly origin: unknown;
      readonly destination: unknown;
    }) => void;
  }
>()('actor-typecheck/StatePersistence') {}

const machine = makeMachine({
  states: { idle: Idle, editing: Editing },
  initial: Idle.make({ draft: 'draft' }),
  routes: {
    idle: {
      commands: {
        edit: {
          payload: Schema.Struct({ value: Schema.String }),
          program: Effect.fn('idle.edit')(function* ({ origin, payload }) {
            const prefix = yield* Prefix;
            if (payload.value === 'reject') {
              return yield* Effect.fail<'edit-rejected'>('edit-rejected');
            }
            return Editing.make({
              draft: `${prefix.value}${origin.draft}:${payload.value}`,
              revision: 1,
            });
          }),
        },
        reset: {
          payload: Schema.Void,
          program: Effect.fn('idle.reset')(function* ({ origin, payload }) {
            const noPayload: void = payload;
            void noPayload;
            return Idle.make({ draft: origin.draft });
          }),
        },
      },
    },
  },
});

const prefixLayer = Layer.effect(
  Prefix,
  Effect.gen(function* () {
    const config = yield* LayerConfig;
    if (config.value === 'fail') {
      return yield* Effect.fail('layer-acquisition-failed' as const);
    }
    return { value: config.value };
  }),
);

const saveState = Effect.fn('actor-typecheck.saveState')(function* (props: {
  readonly origin: InferMachineValue<typeof machine>;
  readonly destination: InferMachineValue<typeof machine>;
}) {
  const { destination, origin } = props;
  const persistence = yield* StatePersistence;
  persistence.save({ destination, origin });
});

const statePersistenceLayer = Layer.succeed(StatePersistence, {
  save: () => undefined,
});

const prefixRuntime = ManagedRuntime.make(
  prefixLayer.pipe(
    Layer.provide(Layer.succeed(LayerConfig, { value: 'app:' })),
  ),
);
const actor = makeActor(machine, { runtime: prefixRuntime });
type _ActorSurface = IExpect<
  IEqual<keyof typeof actor, 'getHandle' | 'handleStream' | 'ready' | 'start'>
>;
const actorReady = actor.ready();
type _ActorReadyRequirements = IExpect<
  IEqual<Effect.Services<typeof actorReady>, never>
>;
type _ActorReadyFailure = IExpect<
  IEqual<Effect.Error<typeof actorReady>, 'layer-acquisition-failed'>
>;
const actorFiber = actor.start();
const exactActorFiber: Fiber.Fiber<never, 'layer-acquisition-failed'> =
  actorFiber;
void exactActorFiber;

const savedRuntime = ManagedRuntime.make(
  Layer.merge(
    prefixLayer.pipe(
      Layer.provide(Layer.succeed(LayerConfig, { value: 'app:' })),
    ),
    statePersistenceLayer,
  ),
);
const savedActor = makeActor(machine, {
  runtime: savedRuntime,
  save: saveState,
});
type _SavedActor = IExpect<
  IEqual<
    typeof savedActor,
    IMachineActor<typeof machine, 'layer-acquisition-failed'>
  >
>;
type _SaveOrigin = IExpect<
  IEqual<
    Parameters<typeof saveState>[0]['origin'],
    InferMachineValue<typeof machine>
  >
>;
type _SaveDestination = IExpect<
  IEqual<
    Parameters<typeof saveState>[0]['destination'],
    InferMachineValue<typeof machine>
  >
>;

const inlineSavedActor = makeActor(machine, {
  runtime: prefixRuntime,
  save: ({ destination, origin }) => {
    type _InlineSaveOrigin = IExpect<
      IEqual<typeof origin, InferMachineValue<typeof machine>>
    >;
    type _InlineSaveDestination = IExpect<
      IEqual<typeof destination, InferMachineValue<typeof machine>>
    >;
    return Effect.void;
  },
});
type _InlineSavedActorReadyFailure = IExpect<
  IEqual<
    Effect.Error<ReturnType<typeof inlineSavedActor.ready>>,
    'layer-acquisition-failed'
  >
>;

const scopedSaveActor = makeActor(machine, {
  runtime: prefixRuntime,
  save: () => Effect.scope.pipe(Effect.asVoid),
});
type _ScopedSaveActorRequirements = IExpect<
  IEqual<Effect.Services<ReturnType<typeof scopedSaveActor.ready>>, never>
>;

// @ts-expect-error The Actor runtime must also provide every Save service.
makeActor(machine, {
  runtime: prefixRuntime,
  save: saveState,
});

makeActor(machine, {
  runtime: savedRuntime,
  // @ts-expect-error Save defects are untyped; its error channel must be never.
  save: () => Effect.fail('save-failed' as const),
});

makeActor(machine, {
  // @ts-expect-error The Actor runtime must provide every Machine Route service.
  runtime: ManagedRuntime.make(Layer.empty),
});

makeActor(machine, {
  runtime: ManagedRuntime.make(
    Layer.merge(
      Layer.succeed(Prefix, { value: 'prefix:' }),
      Layer.succeed(ExtraService, { value: 1 }),
    ),
  ),
});

makeActor(machine, {
  runtime: ManagedRuntime.make(
    Layer.fresh(
      prefixLayer.pipe(
        Layer.provide(Layer.succeed(LayerConfig, { value: 'app:' })),
      ),
    ),
  ),
});

const serviceFreeMachine = makeMachine({
  states: { idle: Idle },
  initial: Idle.make({ draft: 'free' }),
  routes: {
    idle: {
      commands: {
        reset: {
          payload: Schema.Void,
          program: Effect.fn('serviceFree.idle.reset')(function* ({ origin }) {
            return Idle.make({ draft: origin.draft });
          }),
        },
      },
    },
  },
});
const serviceFreeActor = makeActor(serviceFreeMachine, {
  runtime: ManagedRuntime.make(Layer.empty),
});
type _ServiceFreeRequirements = IExpect<
  IEqual<Effect.Services<ReturnType<typeof serviceFreeActor.ready>>, never>
>;
type _ServiceFreeFailure = IExpect<
  IEqual<Effect.Error<ReturnType<typeof serviceFreeActor.ready>>, never>
>;

type IIdleHandle = InferStateHandle<typeof machine, typeof machine.states.idle>;
type IEditingHandle = InferStateHandle<
  typeof machine,
  typeof machine.states.editing
>;
type _HandleAlias = IExpect<
  IEqual<
    InferStateHandle<typeof machine, typeof machine.states.idle>,
    IStateHandle<typeof machine, typeof machine.states.idle>
  >
>;
type _MachineHandleUnion = IExpect<
  IEqual<InferMachineStateHandle<typeof machine>, IIdleHandle | IEditingHandle>
>;

const handleFlow = Effect.gen(function* () {
  const handle = yield* actor.getHandle();
  if (handle.stateName === 'idle') {
    const editing: IEditingHandle = yield* handle.commands.edit({
      value: 'next',
    });
    const idle: IIdleHandle = yield* handle.commands.reset();
    void editing;
    void idle;
    // @ts-expect-error Payload Command requires its payload.
    handle.commands.edit();
    // @ts-expect-error Schema.Void Command method takes no argument.
    handle.commands.reset(undefined);
  }
  if (handle.stateName === 'editing') {
    // @ts-expect-error Terminal State has no edit Command.
    handle.commands.edit;
  }
});

const idleCommand = (null as unknown as IIdleHandle).commands.edit({
  value: 'next',
});
type _CommandFailure = IExpect<
  IEqual<Effect.Error<typeof idleCommand>, 'edit-rejected' | StateInactive>
>;
type _CommandDestination = IExpect<
  IEqual<Effect.Success<typeof idleCommand>, IEditingHandle>
>;
type _HandleStream = IExpect<
  IEqual<
    Stream.Success<typeof actor.handleStream>,
    InferMachineStateHandle<typeof machine>
  >
>;

void handleFlow;
