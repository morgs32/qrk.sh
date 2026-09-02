import { Context, Effect, Schema } from 'effect';

import { makeState } from '../makeState/makeState.js';
import type {
  InferMachineRouteServices,
  InferMachineValue,
  InferStateValue
} from '../types.js';
import { makeMachine } from './makeMachine.js';

type IEqual<LEFT, RIGHT> =
  (<TYPE>() => TYPE extends LEFT ? 1 : 2) extends <TYPE>() =>
    TYPE extends RIGHT ? 1 : 2
    ? true
    : false;
type IExpect<VALUE extends true> = VALUE;

const Idle = makeState({
  stateName: 'idle',
  input: { draft: Schema.String }
})
type IIdle = InferStateValue<typeof Idle>;

const Editing = makeState({
  stateName: 'editing',
  input: { draft: Schema.String, revision: Schema.Int }
})
type IEditing = InferStateValue<typeof Editing>;

const Saved = makeState({
  stateName: 'saved',
  input: { documentId: Schema.String }
})
type ISaved = InferStateValue<typeof Saved>;

class Prefix extends Context.Service<
  Prefix,
  { readonly value: string }
>()('machine-typecheck/Prefix') {}

class DocumentIds extends Context.Service<
  DocumentIds,
  { readonly next: string }
>()('machine-typecheck/DocumentIds') {}

const idleInitial = Idle.make({ draft: 'draft' });

const machine = makeMachine({
  states: { idle: Idle, editing: Editing, saved: Saved },
  initial: idleInitial,
  routes: {
    idle: {
      commands: {
        edit: {
          payload: Schema.Struct({ value: Schema.String }),
          program: Effect.fn('idle.edit')(function* ({ origin, payload }) {
            const idle: IIdle = origin;
            const input: { readonly value: string } = payload;
            void idle;
            void input;
            const prefix = yield* Prefix;
            if (payload.value === 'reject') {
              return yield* Effect.fail<'edit-rejected'>('edit-rejected');
            }
            return Editing.make({
              draft: `${prefix.value}${origin.draft}:${payload.value}`,
              revision: 1
            });
          })
        },
        reset: {
          payload: Schema.Void,
          program: Effect.fn('idle.reset')(function* ({ origin, payload }) {
            const noPayload: void = payload;
            void noPayload;
            return Idle.make({ draft: origin.draft });
          })
        }
      }
    },
    editing: {
      onActivation: Effect.fn('editing.onActivation')(
        function* ({ origin }) {
          const editing: IEditing = origin;
          void editing;
          const documentIds = yield* DocumentIds;
          return Saved.make({
            documentId: `${documentIds.next}:${origin.revision}`
          });
        }
      ),
      commands: {
        save: {
          payload: Schema.Void,
          program: Effect.fn('editing.save')(function* ({ origin, payload }) {
            const noPayload: void = payload;
            void noPayload;
            return Saved.make({ documentId: `${origin.revision}` });
          })
        }
      }
    }
  }
});

type _RawMachineValue = IExpect<
  IEqual<InferMachineValue<typeof machine>, IIdle | IEditing | ISaved>
>;
type _RouteServices = IExpect<
  IEqual<InferMachineRouteServices<typeof machine>, Prefix | DocumentIds>
>;

// @ts-expect-error Machine declaration fields are readonly.
machine.routes = {};

const activationOnlyMachine = makeMachine({
  states: { idle: Idle, editing: Editing },
  initial: idleInitial,
  routes: {
    idle: {
      onActivation: Effect.fn('idle.onActivation')(
        function* ({ origin }) {
          const idle: IIdle = origin;
          void idle;
          return Editing.make({
            draft: origin.draft,
            revision: 1
          });
        }
      )
    }
  }
});

makeMachine({
  states: machine.states,
  initial: idleInitial,
  routes: {
    ...machine.routes,
    // @ts-expect-error Route placement keys must name registered States.
    missing: {
      onActivation: Effect.fn('missing.onActivation')(function* () {
        return Saved.make({ documentId: 'again' });
      })
    }
  }
});

makeMachine({
  states: machine.states,
  initial: idleInitial,
  routes: {
    ...machine.routes,
    idle: {
      ...machine.routes.idle,
      // @ts-expect-error Route entries contain only onActivation and commands.
      activation: Effect.fn('idle.activation')(function* () {
        return Saved.make({ documentId: 'wrong-key' });
      })
    }
  }
});

makeMachine({
  states: machine.states,
  initial: idleInitial,
  routes: {
    ...machine.routes,
    editing: {
      ...machine.routes.editing,
      // @ts-expect-error Activation leaves must be Effect-returning functions.
      onActivation: 1
    }
  }
});

makeMachine({
  states: machine.states,
  initial: idleInitial,
  routes: {
    ...machine.routes,
    editing: {
      ...machine.routes.editing,
      // @ts-expect-error Activation programs have no typed failure channel.
      onActivation: Effect.fn('editing.failingActivation')(function* () {
        return yield* Effect.fail('activation-failed' as const);
      })
    }
  }
});

const Other = makeState({
  stateName: 'other',
  input: {}
})
const Numeric = makeState({
  stateName: '1',
  input: {}
})

makeMachine({
  states: machine.states,
  initial: idleInitial,
  routes: {
    ...machine.routes,
    editing: {
      ...machine.routes.editing,
      // @ts-expect-error Route success must be a registered Machine State.
      onActivation: Effect.fn('editing.unregistered')(function* () {
        return Other.make({});
      })
    }
  }
});

makeMachine({
  states: machine.states,
  initial: idleInitial,
  routes: {
    ...machine.routes,
    idle: {
      commands: {
        ...machine.routes.idle.commands,
        edit: {
          ...machine.routes.idle.commands.edit,
          // Command failures are inferred, not declared by a Schema.
          program: Effect.fn('idle.otherFailure')(function* () {
            return yield* Effect.fail('any-command-failure' as const);
          })
        }
      }
    }
  }
});

makeMachine({
  states: {
    // @ts-expect-error State keys equal canonical State names.
    wrong: Idle,
    editing: Editing
  },
  initial: idleInitial as never,
  routes: {} as never
});

makeMachine({
  states: {
    // @ts-expect-error State map keys must be authored as strings.
    1: Numeric
  },
  initial: Numeric.make({}) as never,
  routes: {} as never
});

makeMachine({
  states: { idle: Idle },
  initial: idleInitial,
  // @ts-expect-error A Machine requires at least one Route.
  routes: {}
});

makeMachine({
  states: { idle: Idle },
  initial: idleInitial,
  routes: {
    // @ts-expect-error A placed State Route cannot be empty.
    idle: {}
  }
});

makeMachine({
  states: { idle: Idle },
  initial: idleInitial,
  routes: {
    idle: {
      // @ts-expect-error Present commands must contain a Command Route.
      commands: {}
    }
  }
});

makeMachine({
  states: machine.states,
  // @ts-expect-error Initial State must be registered by the Machine.
  initial: Other.make({}),
  routes: machine.routes
});

makeMachine({
  states: machine.states,
  // @ts-expect-error Initial State fields satisfy the registered State.
  initial: { stateName: 'idle', draft: 1 },
  routes: machine.routes
});

const sharedProgram = Effect.fn('shared.reset')(function* (request: {
  readonly origin: IIdle | IEditing;
  readonly payload: void;
}) {
  return Idle.make({ draft: request.origin.draft });
});
const sharedCommand = { payload: Schema.Void, program: sharedProgram };
const idleOnlyCommand = {
  payload: Schema.Void,
  program: Effect.fn('idle-only.reset')(function* (request: {
    readonly origin: IIdle;
    readonly payload: void;
  }) {
    return Idle.make({ draft: request.origin.draft });
  })
};
const commandWithExtraField = { ...sharedCommand, unexpected: true };

makeMachine({
  states: { idle: Idle },
  initial: idleInitial,
  routes: {
    idle: {
      commands: {
        // @ts-expect-error Extracted Command Routes are exact too.
        reset: commandWithExtraField
      }
    }
  }
});

makeMachine({
  states: { idle: Idle, editing: Editing },
  initial: idleInitial,
  routes: {
    editing: {
      commands: {
        // @ts-expect-error A reused program must accept this placement's origin.
        reset: idleOnlyCommand
      }
    }
  }
});

const sharedMachine = makeMachine({
  states: { idle: Idle, editing: Editing, saved: Saved },
  initial: idleInitial,
  routes: {
    idle: { commands: { reset: sharedCommand } },
    editing: { commands: { reset: sharedCommand } }
  }
});
type _SharedCommandReference = IExpect<
  IEqual<
    typeof sharedMachine.routes.idle.commands.reset,
    typeof sharedMachine.routes.editing.commands.reset
  >
>;

void machine;
void activationOnlyMachine;
void sharedMachine;
