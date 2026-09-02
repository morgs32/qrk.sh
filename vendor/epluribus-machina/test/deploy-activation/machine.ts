import { Effect, Schema } from 'effect';

import { makeMachine } from '../../src/makeMachine/makeMachine.js';
import { makeState } from '../../src/makeState/makeState.js';
import type { InferStateValue } from '../../src/types.js';
import { DeployStore } from './deploy-store.js';

const Allocated = makeState({
  stateName: 'allocated',
  input: {}
})

const GenerationPrepared = makeState({
  stateName: 'generation-prepared',
  input: {}
})

const ContinuousReplay = makeState({
  stateName: 'continuous-replay',
  input: {}
})

const PreCutReady = makeState({
  stateName: 'pre-cut-ready',
  input: {}
})

const OwnershipCut = makeState({
  stateName: 'ownership-cut',
  input: {}
})

const SourceWritesTerminal = makeState({
  stateName: 'source-writes-terminal',
  input: {}
})

const FixedPointDrained = makeState({
  stateName: 'fixed-point-drained',
  input: {}
})

const FinalReplayComplete = makeState({
  stateName: 'final-replay-complete',
  input: {}
})

const Succeeded = makeState({
  stateName: 'succeeded',
  input: {}
})

const Failed = makeState({
  stateName: 'failed',
  input: {}
})

export { Allocated, OwnershipCut };

const states = {
  allocated: Allocated,
  'generation-prepared': GenerationPrepared,
  'continuous-replay': ContinuousReplay,
  'pre-cut-ready': PreCutReady,
  'ownership-cut': OwnershipCut,
  'source-writes-terminal': SourceWritesTerminal,
  'fixed-point-drained': FixedPointDrained,
  'final-replay-complete': FinalReplayComplete,
  succeeded: Succeeded,
  failed: Failed
};

type IDeployInitial = InferStateValue<(typeof states)[keyof typeof states]>;

export const makeDeployActivationMachine = (props: {
  readonly initial: IDeployInitial;
  readonly finishContinuousReplay?: Effect.Effect<void>;
}) => {
  const { finishContinuousReplay = Effect.void, initial } = props;
  const failActivation = {
    payload: Schema.Void,
    program: Effect.fn('failActivation')(function* () {
      const store = yield* DeployStore;
      yield* store.failBeforeCutover();
      return Failed.make({});
    })
  };

  return makeMachine({
    states,
    initial,
    routes: {
      allocated: {
        commands: {
          prepareGeneration: {
            payload: Schema.Void,
            program: Effect.fn('prepareGeneration')(function* () {
              const store = yield* DeployStore;
              yield* store.advance(
                'allocated',
                'generation-prepared',
                'prepareGeneration'
              );
              return GenerationPrepared.make({});
            })
          },
          failActivation
        }
      },
      'generation-prepared': {
        commands: {
          startContinuousReplay: {
            payload: Schema.Void,
            program: Effect.fn('startContinuousReplay')(function* () {
              const store = yield* DeployStore;
              yield* store.advance(
                'generation-prepared',
                'continuous-replay',
                'startContinuousReplay'
              );
              return ContinuousReplay.make({});
            })
          },
          failActivation
        }
      },
      'continuous-replay': {
        onActivation: Effect.fn('finishContinuousReplay')(function* () {
          const store = yield* DeployStore;
          yield* finishContinuousReplay;
          yield* store
            .advance(
              'continuous-replay',
              'pre-cut-ready',
              'finishContinuousReplay'
            )
            .pipe(Effect.orDie);
          return PreCutReady.make({});
        }),
        commands: { failActivation }
      },
      'pre-cut-ready': {
        commands: {
          cutover: {
            payload: Schema.Struct({ defectAfterCommit: Schema.Boolean }),
            program: Effect.fn('cutover')(function* ({ payload }) {
              const store = yield* DeployStore;
              yield* store.commitCutover();
              if (payload.defectAfterCommit) {
                return yield* Effect.die(new Error('process-crashed'));
              }
              yield* store.recordOwnershipCut();
              return OwnershipCut.make({});
            })
          },
          failActivation
        }
      },
      'ownership-cut': {
        commands: {
          drainSourceWrites: {
            payload: Schema.Struct({ interrupt: Schema.Boolean }),
            program: Effect.fn('drainSourceWrites')(function* ({ payload }) {
              const store = yield* DeployStore;
              if (payload.interrupt) {
                return yield* Effect.fail<'source-write-drain-interrupted'>(
                  'source-write-drain-interrupted'
                );
              }
              yield* store.advance(
                'ownership-cut',
                'source-writes-terminal',
                'drainSourceWrites'
              );
              return SourceWritesTerminal.make({});
            })
          }
        }
      },
      'source-writes-terminal': {
        commands: {
          reachFixedPoint: {
            payload: Schema.Void,
            program: Effect.fn('reachFixedPoint')(function* () {
              const store = yield* DeployStore;
              yield* store.advance(
                'source-writes-terminal',
                'fixed-point-drained',
                'reachFixedPoint'
              );
              return FixedPointDrained.make({});
            })
          }
        }
      },
      'fixed-point-drained': {
        commands: {
          finishFinalReplay: {
            payload: Schema.Void,
            program: Effect.fn('finishFinalReplay')(function* () {
              const store = yield* DeployStore;
              yield* store.advance(
                'fixed-point-drained',
                'final-replay-complete',
                'finishFinalReplay'
              );
              return FinalReplayComplete.make({});
            })
          }
        }
      },
      'final-replay-complete': {
        commands: {
          promote: {
            payload: Schema.Void,
            program: Effect.fn('promote')(function* () {
              const store = yield* DeployStore;
              yield* store.promote();
              return Succeeded.make({});
            })
          }
        }
      }
    }
  });
};

export type IDeployActivationMachine = ReturnType<
  typeof makeDeployActivationMachine
>;
