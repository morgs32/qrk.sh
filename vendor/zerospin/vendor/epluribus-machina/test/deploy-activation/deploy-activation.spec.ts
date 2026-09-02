import { it } from '@effect/vitest';
import {
  Cause,
  Effect,
  Exit,
  Fiber,
  Layer,
  ManagedRuntime,
  Option,
  Stream,
} from 'effect';
import { describe, expect } from 'vitest';

import { makeActor } from '../../src/makeActor/makeActor.js';
import { StateInactive } from '../../src/StateInactive.js';
import type {
  IMachineActor,
  InferMachineStateHandle,
} from '../../src/types.js';

import {
  DeployStore,
  makeDurableDeployStore,
  type IDurableDeployStore,
} from './deploy-store.js';
import {
  Allocated,
  makeDeployActivationMachine,
  OwnershipCut,
  type IDeployActivationMachine,
} from './machine.js';

type IDeployHandle = InferMachineStateHandle<IDeployActivationMachine>;

const awaitHandle = Effect.fn('awaitHandle')(function* (props: {
  readonly actor: IMachineActor<IDeployActivationMachine, never>;
  readonly tag: IDeployHandle['stateName'];
}) {
  const { actor, tag } = props;
  const handle = yield* actor.handleStream.pipe(
    Stream.filter(candidate => candidate.stateName === tag),
    Stream.runHead,
  );

  return yield* Option.match(handle, {
    onNone: () =>
      Effect.die(new Error(`Actor ended before reaching State "${tag}"`)),
    onSome: Effect.succeed,
  });
});

const acquireRuntime = (store: IDurableDeployStore) =>
  Effect.acquireRelease(
    Effect.sync(() => ManagedRuntime.make(Layer.succeed(DeployStore, store))),
    runtime => runtime.disposeEffect,
  );

const attributes = {
  deployId: 'deploy-target',
  sourceGenerationId: 'generation-source',
  targetGenerationId: 'generation-target',
};

describe('Zerospin Linked Deploy Activation benchmark', () => {
  it.effect(
    'invokes a linked migration through preCutover, cutover, and postCutover',
    () => {
      const store = makeDurableDeployStore(attributes);

      return Effect.scoped(
        Effect.gen(function* () {
          const initial = Allocated.make({});
          const machine = makeDeployActivationMachine({ initial });
          const runtime = yield* acquireRuntime(store);
          const actor = makeActor(machine, { runtime });
          const actorFiber = actor.start();
          yield* actor.ready();
          const allocated = yield* actor.getHandle();
          if (allocated.stateName !== 'allocated') {
            return yield* Effect.die(new Error('Expected allocated'));
          }

          const prepared = yield* allocated.commands.prepareGeneration();
          const replay = yield* prepared.commands.startContinuousReplay();
          expect(replay.stateName).toBe('continuous-replay');

          const preCutReady = yield* awaitHandle({
            actor,
            tag: 'pre-cut-ready',
          });
          if (preCutReady.stateName !== 'pre-cut-ready') {
            return yield* Effect.die(new Error('Expected pre-cut-ready'));
          }
          const ownershipCut = yield* preCutReady.commands.cutover({
            defectAfterCommit: false,
          });
          const sourceTerminal = yield* ownershipCut.commands.drainSourceWrites(
            {
              interrupt: false,
            },
          );
          const fixedPoint = yield* sourceTerminal.commands.reachFixedPoint();
          const replayComplete = yield* fixedPoint.commands.finishFinalReplay();
          const succeeded = yield* replayComplete.commands.promote();

          expect(succeeded.stateName).toBe('succeeded');
          expect(yield* actor.getHandle()).toBe(succeeded);
          expect(store.snapshot()).toMatchObject({
            activeDeployId: 'deploy-target',
            checkpoint: 'final-replay-complete',
            sourcePhase: 'retired',
            status: 'succeeded',
            writeGenerationId: 'generation-target',
          });
          expect(store.calls).toEqual([
            'prepareGeneration',
            'startContinuousReplay',
            'finishContinuousReplay',
            'commitCutover',
            'recordOwnershipCut',
            'drainSourceWrites',
            'reachFixedPoint',
            'finishFinalReplay',
            'promote',
          ]);

          yield* Fiber.interrupt(actorFiber);
        }),
      );
    },
  );

  it.effect(
    'supports pre-cutover failure and preserves post-cutover retry',
    () =>
      Effect.gen(function* () {
        const preCutoverStore = makeDurableDeployStore(attributes);

        yield* Effect.scoped(
          Effect.gen(function* () {
            const initial = Allocated.make({});
            const machine = makeDeployActivationMachine({ initial });
            const runtime = yield* acquireRuntime(preCutoverStore);
            const actor = makeActor(machine, { runtime });
            const actorFiber = actor.start();
            yield* actor.ready();
            const allocated = yield* actor.getHandle();
            if (allocated.stateName !== 'allocated') {
              return yield* Effect.die(new Error('Expected allocated'));
            }
            const prepared = yield* allocated.commands.prepareGeneration();
            const failed = yield* prepared.commands.failActivation();
            expect(failed.stateName).toBe('failed');
            expect(yield* actor.getHandle()).toBe(failed);
            expect(preCutoverStore.snapshot().status).toBe('failed');

            yield* Fiber.interrupt(actorFiber);
          }),
        );

        const postCutoverStore = makeDurableDeployStore(attributes);
        yield* Effect.scoped(
          Effect.gen(function* () {
            const initial = Allocated.make({});
            const machine = makeDeployActivationMachine({ initial });
            const runtime = yield* acquireRuntime(postCutoverStore);
            const actor = makeActor(machine, { runtime });
            const actorFiber = actor.start();
            yield* actor.ready();
            const allocated = yield* actor.getHandle();
            if (allocated.stateName !== 'allocated') {
              return yield* Effect.die(new Error('Expected allocated'));
            }
            const prepared = yield* allocated.commands.prepareGeneration();
            yield* prepared.commands.startContinuousReplay();
            const preCutReady = yield* awaitHandle({
              actor,
              tag: 'pre-cut-ready',
            });
            if (preCutReady.stateName !== 'pre-cut-ready') {
              return yield* Effect.die(new Error('Expected pre-cut-ready'));
            }
            const ownershipCut = yield* preCutReady.commands.cutover({
              defectAfterCommit: false,
            });

            const inactive = yield* Effect.flip(
              preCutReady.commands.failActivation(),
            );
            expect(inactive).toBeInstanceOf(StateInactive);
            expect(inactive).toMatchObject({
              state: 'pre-cut-ready',
              current: 'ownership-cut',
            });

            expect(
              yield* Effect.flip(
                ownershipCut.commands.drainSourceWrites({
                  interrupt: true,
                }),
              ),
            ).toBe('source-write-drain-interrupted');
            expect(yield* actor.getHandle()).toBe(ownershipCut);

            const sourceTerminal =
              yield* ownershipCut.commands.drainSourceWrites({
                interrupt: false,
              });
            expect(sourceTerminal.stateName).toBe('source-writes-terminal');
            expect(yield* actor.getHandle()).toBe(sourceTerminal);

            yield* Fiber.interrupt(actorFiber);
          }),
        );
      }),
  );

  it.effect(
    'reconciles after a cutover defect commits ownership before its checkpoint',
    () =>
      Effect.gen(function* () {
        const store = makeDurableDeployStore(attributes);

        yield* Effect.scoped(
          Effect.gen(function* () {
            const initial = Allocated.make({});
            const machine = makeDeployActivationMachine({ initial });
            const runtime = yield* acquireRuntime(store);
            const actor = makeActor(machine, { runtime });
            const actorFiber = actor.start();
            yield* actor.ready();
            const allocated = yield* actor.getHandle();
            if (allocated.stateName !== 'allocated') {
              return yield* Effect.die(new Error('Expected allocated'));
            }
            const prepared = yield* allocated.commands.prepareGeneration();
            yield* prepared.commands.startContinuousReplay();
            const preCutReady = yield* awaitHandle({
              actor,
              tag: 'pre-cut-ready',
            });
            if (preCutReady.stateName !== 'pre-cut-ready') {
              return yield* Effect.die(new Error('Expected pre-cut-ready'));
            }

            const interrupted = yield* Effect.exit(
              preCutReady.commands.cutover({ defectAfterCommit: true }),
            );
            expect(Exit.isFailure(interrupted)).toBe(true);
            if (Exit.isFailure(interrupted)) {
              expect(Cause.squash(interrupted.cause)).toMatchObject({
                message: 'process-crashed',
              });
            }
            expect(yield* actor.getHandle()).toBe(preCutReady);
            expect(store.snapshot()).toMatchObject({
              checkpoint: 'pre-cut-ready',
              sourcePhase: 'draining',
              writeGenerationId: 'generation-target',
            });

            yield* Fiber.interrupt(actorFiber);
          }),
        );

        yield* store.recordOwnershipCut();
        yield* Effect.scoped(
          Effect.gen(function* () {
            const initial = OwnershipCut.make({});
            const machine = makeDeployActivationMachine({ initial });
            const runtime = yield* acquireRuntime(store);
            const actor = makeActor(machine, { runtime });
            const actorFiber = actor.start();
            yield* actor.ready();
            const ownershipCut = yield* actor.getHandle();
            if (ownershipCut.stateName !== 'ownership-cut') {
              return yield* Effect.die(new Error('Expected ownership-cut'));
            }
            expect(store.snapshot().checkpoint).toBe('ownership-cut');

            const sourceTerminal =
              yield* ownershipCut.commands.drainSourceWrites({
                interrupt: false,
              });
            const fixedPoint = yield* sourceTerminal.commands.reachFixedPoint();
            const replayComplete =
              yield* fixedPoint.commands.finishFinalReplay();
            const succeeded = yield* replayComplete.commands.promote();
            expect(succeeded.stateName).toBe('succeeded');
            expect(yield* actor.getHandle()).toBe(succeeded);

            yield* Fiber.interrupt(actorFiber);
          }),
        );
      }),
  );
});
