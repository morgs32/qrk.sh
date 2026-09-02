import { Context, Effect } from 'effect';
import { createStore } from 'zustand/vanilla';

export type IActivationCheckpoint =
  | 'allocated'
  | 'generation-prepared'
  | 'continuous-replay'
  | 'pre-cut-ready'
  | 'ownership-cut'
  | 'source-writes-terminal'
  | 'fixed-point-drained'
  | 'final-replay-complete';

export interface IActivationAttributes {
  readonly deployId: string;
  readonly sourceGenerationId: string;
  readonly targetGenerationId: string;
}

export interface IActivationSnapshot extends IActivationAttributes {
  readonly activeDeployId: string;
  readonly checkpoint: IActivationCheckpoint;
  readonly sourcePhase: 'open' | 'draining' | 'retired';
  readonly status: 'activating' | 'succeeded' | 'failed';
  readonly writeGenerationId: string;
}

interface IActivationPersistedState extends IActivationSnapshot {
  readonly calls: ReadonlyArray<string>;
}

export interface IDurableDeployStore {
  readonly attributes: IActivationAttributes;
  readonly calls: ReadonlyArray<string>;
  readonly advance: (
    expected: IActivationCheckpoint,
    next: IActivationCheckpoint,
    operation: string
  ) => Effect.Effect<void, 'stale-checkpoint'>;
  readonly commitCutover: () => Effect.Effect<void, 'stale-checkpoint'>;
  readonly failBeforeCutover: () => Effect.Effect<
    void,
    'cutover-already-committed'
  >;
  readonly promote: () => Effect.Effect<void, 'stale-checkpoint'>;
  readonly recordOwnershipCut: () => Effect.Effect<void, 'stale-checkpoint'>;
  readonly snapshot: () => IActivationSnapshot;
}

export class DeployStore extends Context.Service<
  DeployStore,
  IDurableDeployStore
>()('benchmark/DeployStore') {}

const toSnapshot = (
  state: IActivationPersistedState
): IActivationSnapshot => {
  const { calls: _calls, ...snapshot } = state;
  return snapshot;
};

export const makeDurableDeployStore = (
  attributes: IActivationAttributes
): IDurableDeployStore => {
  const store = createStore<IActivationPersistedState>(() => ({
    ...attributes,
    activeDeployId: 'deploy-source',
    checkpoint: 'allocated',
    sourcePhase: 'open',
    status: 'activating',
    writeGenerationId: attributes.sourceGenerationId,
    calls: []
  }));

  return {
    attributes,
    get calls() {
      return store.getState().calls;
    },
    advance: (expected, next, operation) =>
      Effect.suspend(() => {
        const current = store.getState();
        if (current.status !== 'activating' || current.checkpoint !== expected) {
          return Effect.fail('stale-checkpoint');
        }
        store.setState({
          checkpoint: next,
          calls: [...current.calls, operation]
        });
        return Effect.void;
      }),
    commitCutover: () =>
      Effect.suspend(() => {
        const current = store.getState();
        if (
          current.status !== 'activating' ||
          current.checkpoint !== 'pre-cut-ready' ||
          current.sourcePhase !== 'open'
        ) {
          return Effect.fail('stale-checkpoint');
        }
        store.setState({
          sourcePhase: 'draining',
          writeGenerationId: attributes.targetGenerationId,
          calls: [...current.calls, 'commitCutover']
        });
        return Effect.void;
      }),
    failBeforeCutover: () =>
      Effect.suspend(() => {
        const current = store.getState();
        if (
          current.sourcePhase !== 'open' ||
          current.writeGenerationId !== attributes.sourceGenerationId
        ) {
          return Effect.fail('cutover-already-committed');
        }
        store.setState({
          status: 'failed',
          calls: [...current.calls, 'failActivation']
        });
        return Effect.void;
      }),
    promote: () =>
      Effect.suspend(() => {
        const current = store.getState();
        if (
          current.status !== 'activating' ||
          current.checkpoint !== 'final-replay-complete'
        ) {
          return Effect.fail('stale-checkpoint');
        }
        store.setState({
          activeDeployId: attributes.deployId,
          sourcePhase: 'retired',
          status: 'succeeded',
          calls: [...current.calls, 'promote']
        });
        return Effect.void;
      }),
    recordOwnershipCut: () =>
      Effect.suspend(() => {
        const current = store.getState();
        if (
          current.status !== 'activating' ||
          current.checkpoint !== 'pre-cut-ready' ||
          current.sourcePhase !== 'draining' ||
          current.writeGenerationId !== attributes.targetGenerationId
        ) {
          return Effect.fail('stale-checkpoint');
        }
        store.setState({
          checkpoint: 'ownership-cut',
          calls: [...current.calls, 'recordOwnershipCut']
        });
        return Effect.void;
      }),
    snapshot: () => toSnapshot(store.getState())
  };
};
