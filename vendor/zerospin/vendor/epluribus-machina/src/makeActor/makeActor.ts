import {
  Cause,
  Context,
  Deferred,
  Effect,
  Exit,
  Fiber,
  Ref,
  Scope,
  Semaphore,
  type ManagedRuntime,
  type Schema,
} from 'effect';

import { validateMachine } from '../makeMachine/validateMachine.js';
import { StateInactive } from '../StateInactive.js';
import type {
  IAnyState,
  IMachine,
  IMachineActor,
  InferMachineRouteServices,
  InferMachineValue,
  IStateMap,
} from '../types.js';

import { invokeActivationProgram } from './invokeActivationProgram.js';
import { invokeCommandProgram } from './invokeCommandProgram.js';
import { makeHandleStore } from './makeHandleStore.js';

type IStateValue = { readonly stateName: string };

type IActorSave<
  MACHINE extends IMachine<any, any, any>,
  SERVICES,
> = (transition: {
  readonly origin: InferMachineValue<MACHINE>;
  readonly destination: InferMachineValue<MACHINE>;
}) => Effect.Effect<void, never, SERVICES>;

type IActorSaveCandidate<MACHINE extends IMachine<any, any, any>> =
  (transition: {
    readonly origin: InferMachineValue<MACHINE>;
    readonly destination: InferMachineValue<MACHINE>;
  }) => unknown;

type IActorSaveServices<SAVE> = SAVE extends (
  ...args: infer _ARGS
) => Effect.Effect<infer _SUCCESS, infer _FAILURE, infer SERVICES>
  ? SERVICES
  : never;

type ICheckedActorSave<
  MACHINE extends IMachine<any, any, any>,
  SAVE extends IActorSaveCandidate<MACHINE>,
> = SAVE &
  (SAVE extends (
    ...args: infer _ARGS
  ) => Effect.Effect<infer SUCCESS, infer FAILURE, infer _SERVICES>
    ? [FAILURE] extends [never]
      ? [SUCCESS] extends [void]
        ? unknown
        : IActorSave<MACHINE, never>
      : IActorSave<MACHINE, never>
    : IActorSave<MACHINE, never>);

type IRuntimeSave = (transition: {
  readonly origin: IStateValue;
  readonly destination: IStateValue;
}) => Effect.Effect<void, never, unknown>;

type IRuntimeActivationProgram = (request: {
  readonly origin: IStateValue;
}) => Effect.Effect<unknown, unknown, unknown>;

type IRuntimeCommandProgram = (request: {
  readonly origin: IStateValue;
  readonly payload: unknown;
}) => Effect.Effect<unknown, unknown, unknown>;

interface IRuntimeCommandRoute {
  readonly payload: Schema.Top;
  readonly program: IRuntimeCommandProgram;
}

interface IRuntimeStateRoutes {
  readonly onActivation?: IRuntimeActivationProgram;
  readonly commands?: Readonly<Record<string, IRuntimeCommandRoute>>;
}

type IRuntimeMachineRoutes = Readonly<Record<string, IRuntimeStateRoutes>>;

interface IRuntimeStateHandle extends IStateValue {
  readonly commands: Readonly<
    Record<
      string,
      (payload?: unknown) => Effect.Effect<IRuntimeStateHandle, unknown>
    >
  >;
}

type IActorStatus =
  | { readonly _tag: 'Starting' }
  | { readonly _tag: 'Running' }
  | { readonly _tag: 'Closing' }
  | { readonly _tag: 'Closed' }
  | {
      readonly _tag: 'DefectTerminated';
      readonly cause: Cause.Cause<never>;
    };

type ICleanupMode =
  | { readonly _tag: 'Close' }
  | { readonly _tag: 'Closed' }
  | {
      readonly _tag: 'Defect';
      readonly cause: Cause.Cause<never>;
    };

type IActivationRouteExit = Exit.Exit<
  {
    readonly state: IAnyState;
    readonly value: IStateValue;
  },
  never
>;

type IActivationRouteFiber = Fiber.Fiber<
  {
    readonly state: IAnyState;
    readonly value: IStateValue;
  },
  never
>;

interface IActivation {
  readonly id: symbol;
  readonly state: IAnyState;
  readonly value: IStateValue;
  readonly handle: IRuntimeStateHandle;
  readonly scope: Scope.Closeable;
  readonly routeFiber: Ref.Ref<IActivationRouteFiber | undefined>;
}

interface ICommandRequest {
  readonly activationId: symbol;
  readonly state: IAnyState;
  readonly command: IRuntimeCommandRoute;
  readonly path: string;
  readonly payload: unknown;
}

type ICommandExecutor = (
  request: ICommandRequest,
) => Effect.Effect<IRuntimeStateHandle, unknown>;

interface IMakeActor {
  <
    const MACHINE extends IMachine<any, any, any>,
    const SAVE extends IActorSaveCandidate<NoInfer<MACHINE>>,
    const RUNTIME extends ManagedRuntime.ManagedRuntime<
      Exclude<
        | InferMachineRouteServices<NoInfer<MACHINE>>
        | IActorSaveServices<NoInfer<SAVE>>,
        Scope.Scope
      >,
      any
    >,
  >(
    machine: MACHINE,
    props: {
      readonly runtime: RUNTIME;
      readonly save: ICheckedActorSave<NoInfer<MACHINE>, SAVE>;
    },
  ): IMachineActor<MACHINE, ManagedRuntime.ManagedRuntime.Error<RUNTIME>>;
  <
    const MACHINE extends IMachine<any, any, any>,
    const RUNTIME extends ManagedRuntime.ManagedRuntime<
      Exclude<InferMachineRouteServices<NoInfer<MACHINE>>, Scope.Scope>,
      any
    >,
  >(
    machine: MACHINE,
    props: { readonly runtime: RUNTIME; readonly save?: undefined },
  ): IMachineActor<MACHINE, ManagedRuntime.ManagedRuntime.Error<RUNTIME>>;
}

export const makeActor: IMakeActor = <
  const MACHINE extends IMachine<any, any, any>,
  const RUNTIME extends ManagedRuntime.ManagedRuntime<any, any>,
>(
  machine: MACHINE,
  props: {
    readonly runtime: RUNTIME;
    readonly save?: IActorSave<NoInfer<MACHINE>, unknown> | undefined;
  },
) => {
  validateMachine(machine);
  const { runtime, save } = props;
  const states = machine.states as IStateMap;
  const initial = machine.initial as IStateValue;
  const initialState = Object.hasOwn(states, initial.stateName)
    ? states[initial.stateName]
    : undefined;
  if (initialState === undefined) {
    throw new TypeError(
      `MachineActor State is unavailable: ${initial.stateName}`,
    );
  }

  // ALLOWED_CAST: makeMachine validated every exact Route container,
  // payload Schema, and callable program before constructing this Machine.
  const routes = machine.routes as unknown as IRuntimeMachineRoutes;
  // ALLOWED_CAST: The Machine-derived Save input is erased only after
  // makeActor's public overload has checked its exact State-value union.
  const runtimeSave = save as IRuntimeSave | undefined;
  const readiness = Deferred.makeUnsafe<
    void,
    ManagedRuntime.ManagedRuntime.Error<RUNTIME>
  >();

  let hasStarted = false;
  let isReady = false;
  let ownerExit:
    | Exit.Exit<never, ManagedRuntime.ManagedRuntime.Error<RUNTIME>>
    | undefined;
  let commandExecutor: ICommandExecutor | undefined;

  const executeCommandAtBoundary: ICommandExecutor = request =>
    Effect.suspend(() => {
      if (!hasStarted) {
        return Effect.die(
          new TypeError('MachineActor has not been started'),
        );
      }
      if (!isReady) {
        if (ownerExit !== undefined && Exit.isFailure(ownerExit)) {
          return Effect.failCause(ownerExit.cause);
        }
        return Effect.die(new TypeError('MachineActor is not ready'));
      }
      if (commandExecutor === undefined) {
        return Effect.die(new TypeError('MachineActor is not running'));
      }
      return commandExecutor(request);
    });

  const makeStateHandle = (
    state: IAnyState,
    value: IStateValue,
    activationId: symbol,
  ): IRuntimeStateHandle => {
    const commandEntries: Array<
      readonly [
        string,
        (payload?: unknown) => Effect.Effect<IRuntimeStateHandle, unknown>,
      ]
    > = [];
    const stateName = state.stateName;
    const stateRoutes = Object.hasOwn(routes, stateName)
      ? routes[stateName]
      : undefined;
    for (const [commandName, command] of Object.entries(
      stateRoutes?.commands ?? {},
    )) {
      const path = `${stateName}.commands.${commandName}`;
      commandEntries.push([
        commandName,
        (payload?: unknown) =>
          executeCommandAtBoundary({
            activationId,
            state,
            command,
            path,
            payload,
          }),
      ]);
    }
    return {
      ...value,
      commands: Object.fromEntries(commandEntries),
    };
  };

  const initialActivationId = Symbol(initialState.stateName);
  const initialHandle = makeStateHandle(
    initialState,
    initial,
    initialActivationId,
  );
  const handleStore = makeHandleStore({ initialHandle });

  const owner: Effect.Effect<
    never,
    never,
    ManagedRuntime.ManagedRuntime.Services<RUNTIME>
  > = Effect.scoped(
    Effect.gen(function* () {
      // ManagedRuntime builds and owns this Context. Actor interruption only
      // closes Actor-owned scopes; runtime disposal releases Layer resources.
      const routeContext = (yield* Effect.context<
        ManagedRuntime.ManagedRuntime.Services<RUNTIME>
      >()) as Context.Context<any>;
      const actorScope = Scope.makeUnsafe('sequential');
      const gate = Semaphore.makeUnsafe(1);
      const status = Ref.makeUnsafe<IActorStatus>({ _tag: 'Starting' });
      const termination = Deferred.makeUnsafe<never, never>();

      const makeActivation = (
        state: IAnyState,
        value: IStateValue,
        prepared?: {
          readonly id: symbol;
          readonly handle: IRuntimeStateHandle;
        },
      ): IActivation => {
        const id = prepared?.id ?? Symbol(state.stateName);
        return {
          id,
          state,
          value,
          handle: prepared?.handle ?? makeStateHandle(state, value, id),
          scope: Scope.forkUnsafe(actorScope, 'sequential'),
          routeFiber: Ref.makeUnsafe<IActivationRouteFiber | undefined>(
            undefined,
          ),
        };
      };

      const initialActivation = makeActivation(initialState, initial, {
        id: initialActivationId,
        handle: initialHandle,
      });
      const active = Ref.makeUnsafe(initialActivation);

      const checkRunning = Effect.gen(function* () {
        const current = yield* Ref.get(status);
        switch (current._tag) {
          case 'Starting':
            return yield* Effect.die(
              new TypeError('MachineActor is not ready'),
            );
          case 'Running':
            return;
          case 'DefectTerminated':
            return yield* Effect.failCause(current.cause);
          case 'Closing':
          case 'Closed':
            return yield* Effect.die(
              new TypeError('MachineActor is outside its owning Scope'),
            );
        }
      });

      const failStateInactive = (
        state: IAnyState,
        current: IActivation,
      ): Effect.Effect<never, StateInactive> =>
        Effect.fail(
          new StateInactive({
            state: state.stateName,
            current: current.state.stateName,
          }),
        );

      const closeActivation = (
        activation: IActivation,
        exit: Exit.Exit<unknown, unknown>,
      ): Effect.Effect<Cause.Cause<never> | undefined> =>
        Effect.gen(function* () {
          const closeExit = yield* Effect.exit(
            Scope.close(activation.scope, exit),
          );
          if (Exit.isFailure(closeExit)) {
            return closeExit.cause;
          }

          const routeFiber = yield* Ref.get(activation.routeFiber);
          if (routeFiber === undefined) {
            return undefined;
          }
          const routeExit = yield* Fiber.await(routeFiber);
          return Exit.isFailure(routeExit) &&
            !Cause.hasInterruptsOnly(routeExit.cause)
            ? routeExit.cause
            : undefined;
        });

      const terminateActor = (
        cause: Cause.Cause<never>,
      ): Effect.Effect<Cause.Cause<never>> =>
        Effect.uninterruptible(
          Effect.gen(function* () {
            yield* Ref.set(status, { _tag: 'DefectTerminated', cause });
            const closeExit = yield* Effect.exit(
              Scope.close(actorScope, Exit.failCause(cause)),
            );
            const terminalCause = Exit.isFailure(closeExit)
              ? Cause.combine(cause, closeExit.cause)
              : cause;
            if (terminalCause !== cause) {
              yield* Ref.set(status, {
                _tag: 'DefectTerminated',
                cause: terminalCause,
              });
            }
            yield* Deferred.failCause(termination, terminalCause);
            return terminalCause;
          }),
        );

      function commitTransition(transition: {
        readonly previous: IActivation;
        readonly state: IAnyState;
        readonly value: IStateValue;
      }): Effect.Effect<IRuntimeStateHandle> {
        const { previous, state, value } = transition;
        return Effect.uninterruptible(
          Effect.gen(function* () {
            const closeCause = yield* closeActivation(previous, Exit.void);
            if (closeCause !== undefined) {
              const terminalCause = yield* terminateActor(closeCause);
              return yield* Effect.failCause(terminalCause);
            }

            if (runtimeSave !== undefined) {
              const saveExit = yield* Effect.exit(
                Effect.scopedWith(saveScope =>
                  Effect.suspend(() =>
                    runtimeSave({
                      origin: previous.value,
                      destination: value,
                    }),
                  ).pipe(
                    Effect.provide(
                      Context.add(routeContext, Scope.Scope, saveScope),
                    ),
                  ),
                ),
              );
              if (Exit.isFailure(saveExit)) {
                const terminalCause = yield* terminateActor(saveExit.cause);
                return yield* Effect.failCause(terminalCause);
              }
            }

            const installExit = yield* Effect.exit(
              Effect.gen(function* () {
                const next = makeActivation(state, value);
                yield* Ref.set(active, next);
                yield* handleStore.publish(next.handle);
                yield* startActivationRoute(next);
                return next.handle;
              }),
            );
            if (Exit.isFailure(installExit)) {
              const terminalCause = yield* terminateActor(installExit.cause);
              return yield* Effect.failCause(terminalCause);
            }
            return installExit.value;
          }),
        );
      }

      function superviseActivationRoute(
        activation: IActivation,
        exit: IActivationRouteExit,
      ): Effect.Effect<void> {
        return gate.withPermit(
          Effect.gen(function* () {
            const current = yield* Ref.get(active);
            if (
              (yield* Ref.get(status))._tag !== 'Running' ||
              current !== activation
            ) {
              return;
            }

            if (Exit.isFailure(exit)) {
              yield* terminateActor(exit.cause);
              return;
            }

            yield* commitTransition({
              previous: activation,
              state: exit.value.state,
              value: exit.value.value,
            }).pipe(Effect.ignoreCause);
          }),
        );
      }

      function startActivationRoute(
        activation: IActivation,
      ): Effect.Effect<void> {
        const activationStateName = activation.state.stateName;
        const stateRoutes = Object.hasOwn(routes, activationStateName)
          ? routes[activationStateName]
          : undefined;
        const program = stateRoutes?.onActivation;
        if (program === undefined) {
          return Effect.void;
        }
        const path = `${activationStateName}.onActivation`;

        return Effect.gen(function* () {
          const activationRouteContext = Context.add(
            routeContext,
            Scope.Scope,
            activation.scope,
          );
          const activationRouteFiber = yield* Effect.forkIn(
            invokeActivationProgram({
              states,
              path,
              program,
              origin: activation.value,
            }).pipe(Effect.provide(activationRouteContext)),
            activation.scope,
          );
          yield* Ref.set(activation.routeFiber, activationRouteFiber);
          yield* Effect.forkIn(
            Fiber.await(activationRouteFiber).pipe(
              Effect.flatMap(exit =>
                superviseActivationRoute(activation, exit),
              ),
            ),
            actorScope,
          );
        });
      }

      const executeCommand: ICommandExecutor = request => {
        const { activationId, command, path, payload, state } = request;
        return Effect.gen(function* () {
          yield* checkRunning;
          const observed = yield* Ref.get(active);
          if (observed.id !== activationId) {
            return yield* failStateInactive(state, observed);
          }

          return yield* gate.withPermit(
            Effect.gen(function* () {
              yield* checkRunning;
              const previous = yield* Ref.get(active);
              if (previous.id !== activationId) {
                return yield* failStateInactive(state, previous);
              }

              const commandRouteContext = Context.add(
                routeContext,
                Scope.Scope,
                previous.scope,
              );
              const success = yield* invokeCommandProgram({
                states,
                path,
                command,
                origin: previous.value,
                payload,
              }).pipe(Effect.provide(commandRouteContext));

              yield* checkRunning;
              return yield* commitTransition({
                previous,
                state: success.state,
                value: success.value,
              });
            }),
          );
        });
      };

      const cleanupActor = (): Effect.Effect<void> =>
        Effect.uninterruptible(
          Effect.gen(function* () {
            const cleanupMode = yield* Ref.modify<
              IActorStatus,
              ICleanupMode
            >(status, current => {
              switch (current._tag) {
                case 'Starting':
                case 'Running':
                  return [
                    { _tag: 'Close' },
                    { _tag: 'Closing' },
                  ] as const;
                case 'DefectTerminated':
                  return [
                    { _tag: 'Defect', cause: current.cause },
                    current,
                  ] as const;
                case 'Closing':
                case 'Closed':
                  return [{ _tag: 'Closed' }, current] as const;
              }
            });
            if (cleanupMode._tag === 'Closed') {
              return;
            }
            if (cleanupMode._tag === 'Defect') {
              yield* Scope.close(
                actorScope,
                Exit.failCause(cleanupMode.cause),
              ).pipe(Effect.ignoreCause);
              return;
            }

            yield* gate.withPermit(
              Effect.gen(function* () {
                const gatedStatus = yield* Ref.get(status);
                if (gatedStatus._tag === 'DefectTerminated') {
                  yield* Scope.close(
                    actorScope,
                    Exit.failCause(gatedStatus.cause),
                  ).pipe(Effect.ignoreCause);
                  return;
                }
                if (gatedStatus._tag === 'Closed') {
                  return;
                }

                const current = yield* Ref.get(active);
                const closeCause = yield* closeActivation(
                  current,
                  Exit.void,
                );
                if (closeCause !== undefined) {
                  const terminalCause = yield* terminateActor(closeCause);
                  return yield* Effect.failCause(terminalCause);
                }

                const actorCloseExit = yield* Effect.exit(
                  Scope.close(actorScope, Exit.void),
                );
                if (Exit.isFailure(actorCloseExit)) {
                  yield* Ref.set(status, {
                    _tag: 'DefectTerminated',
                    cause: actorCloseExit.cause,
                  });
                  yield* Deferred.failCause(
                    termination,
                    actorCloseExit.cause,
                  );
                  return yield* Effect.failCause(actorCloseExit.cause);
                }
                yield* Ref.set(status, { _tag: 'Closed' });
              }),
            );
          }),
        );

      // From this point on, every exit from the owner runs ordered Actor
      // cleanup before its Fiber publishes the final Exit.
      yield* Effect.uninterruptible(
        Effect.addFinalizer(() => cleanupActor()),
      );
      commandExecutor = executeCommand;
      yield* Ref.set(status, { _tag: 'Running' });
      yield* startActivationRoute(initialActivation);

      // The gate orders readiness against an immediately completing initial
      // Activation. Whichever enters first defines whether startup succeeded
      // or the owner failed before readiness.
      yield* gate.withPermit(
        Effect.gen(function* () {
          const current = yield* Ref.get(status);
          switch (current._tag) {
            case 'Running':
              yield* Effect.sync(() => {
                isReady = true;
                Deferred.doneUnsafe(readiness, Effect.void);
              });
              return;
            case 'DefectTerminated':
              return yield* Effect.failCause(current.cause);
            case 'Starting':
            case 'Closing':
            case 'Closed':
              return yield* Effect.die(
                new TypeError('MachineActor is not ready'),
              );
          }
        }),
      );

      return yield* Deferred.await(termination);
    }),
  );

  const start = (): Fiber.Fiber<
    never,
    ManagedRuntime.ManagedRuntime.Error<RUNTIME>
  > => {
    if (hasStarted) {
      throw new TypeError('MachineActor has already been started');
    }
    hasStarted = true;

    try {
      const fiber = runtime.runFork(owner);
      fiber.addObserver(exit => {
        ownerExit = exit;
        if (!Deferred.isDoneUnsafe(readiness)) {
          Deferred.doneUnsafe(readiness, Exit.asVoid(exit));
        }
      });
      return fiber;
    } catch (error) {
      const exit = Exit.die(error);
      ownerExit = exit;
      Deferred.doneUnsafe(readiness, exit);
      throw error;
    }
  };

  const ready = (): Effect.Effect<
    void,
    ManagedRuntime.ManagedRuntime.Error<RUNTIME>
  > =>
    Effect.suspend(() =>
      hasStarted
        ? Deferred.await(readiness)
        : Effect.die(new TypeError('MachineActor has not been started')),
    );

  // ALLOWED_CAST: the erased runtime machinery is narrowed back to the
  // Machine-derived Handle and ManagedRuntime Layer error at this boundary.
  return {
    getHandle: handleStore.getHandle,
    handleStream: handleStore.handleStream,
    start,
    ready,
  } as IMachineActor<
    MACHINE,
    ManagedRuntime.ManagedRuntime.Error<RUNTIME>
  >;
};
