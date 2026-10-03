export type IOwner =
  | 'system'
  | 'user'
  | 'marketplace'
  | 'promotion'
  | 'browser'
  | 'provider';
export type IConnectionKind =
  | 'relationship'
  | 'command'
  | 'projection'
  | 'websocket'
  | 'async'
  | 'access';
export type ISource = { path: string; line?: number; note?: string };
export type IColumn = {
  name: string;
  type: string;
  primaryKey?: boolean;
  nullable?: boolean;
  unique?: boolean;
  reference?: { table: string; column: string };
};
export type ITable = {
  id: string;
  repoId: string;
  name: string;
  columns: readonly IColumn[];
  source: ISource;
  description?: string;
  illustrative?: boolean;
  indexes?: readonly {
    name: string;
    columns: readonly string[];
    unique?: boolean;
  }[];
};
export type IRepo = {
  id: string;
  name: string;
  abbreviation: string;
  owner: IOwner;
  identity: string;
  description: string;
  source: ISource;
  repoType?: string;
  illustrative?: boolean;
  position: { x: number; y: number };
};
export type IEntity = {
  id: string;
  name: string;
  kind:
    | 'session'
    | 'socket'
    | 'access'
    | 'owner'
    | 'actor'
    | 'provider'
    | 'contract'
    | 'agent';
  owner: IOwner;
  description: string;
  source: ISource;
  illustrative?: boolean;
  contractId?: string;
  position: { x: number; y: number };
};
export type IConnection = {
  id: string;
  source: string;
  destination: string;
  kind: IConnectionKind;
  label: string;
  sourceColumn?: string;
  destinationColumn?: string;
};
export type IRow = Record<string, unknown>;
export type IRows = Record<string, readonly IRow[]>;
export type IRowChange = { tableId: string; rows: readonly IRow[] };
export type IContract = {
  id: string;
  name: string;
  version: string;
  role: string;
  description: string;
  source: ISource;
  illustrative?: boolean;
  payload: unknown;
  result: unknown;
  operations: readonly string[];
  program: string;
  mapping?: string;
};
export type IScenarioStep = {
  id: string;
  title: string;
  description: string;
  phase: 'local' | 'delivery' | 'transaction' | 'external' | 'replay';
  focus: readonly string[];
  connections: readonly string[];
  changes: readonly IRowChange[];
  contractId?: string;
  source: ISource;
  note?: string;
};
export type IScenario = {
  id: string;
  name: string;
  description: string;
  illustrative: boolean;
  initialRows: IRows;
  steps: readonly IScenarioStep[];
};
export type ISnapshot = {
  rows: IRows;
  previousRows: IRows;
  step: IScenarioStep | undefined;
  stepIndex: number;
  changedTableIds: readonly string[];
};
