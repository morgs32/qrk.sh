import type { Effect, Schema } from 'effect';

export type IStateValue = Readonly<{ stateName: string }>;
export type IStateRow = Readonly<{
  id: number;
  revision: number;
  stateName: string;
  stateJson: string;
  sourceVersion: string;
  sourceIndex: number;
  projectionTables: string;
  phase: 'bootstrap' | 'rebuilding' | 'ready';
  rebuildDestination: number | null;
  previousVersion: string | null;
  wakeAt: number | null;
}>;
export type IMachineOperation = Readonly<{
  id: `mop_${string}`;
  revision: number;
  kind: 'activation' | 'command';
  status: 'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  failure: string | null;
  commandJson: string | null;
  resultJson: string | null;
  retryAt: number | null;
}>;
export type IRuntimeRoute = Readonly<{
  onCommand?: (props: {
    origin: IStateValue;
    db: unknown;
    command: unknown;
  }) => unknown;
  wakeAt?: (props: { origin: IStateValue }) => number;
  onWake?: (props: { origin: IStateValue; db: unknown }) => unknown;
  onActivation?: (props: {
    origin: IStateValue;
  }) => Effect.Effect<unknown, unknown, unknown>;
  command?: (props: { origin: IStateValue }) => unknown;
  onResult?: (props: {
    origin: IStateValue;
    db: unknown;
    result: unknown;
  }) => unknown;
}>;

export type IRouteContractChannel = 'success' | 'failure';
export type IRouteContractIssue =
  | 'MissingStateName'
  | 'UnregisteredState'
  | 'SchemaFailure';
export type IRouteContractExpected = readonly string[] | Schema.Top;
