export type IOwner = 'system' | 'aggregate' | 'service' | 'browser';
export type IConnectionKind =
  | 'relationship'
  | 'session-execute'
  | 'session-stage'
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
  purpose?: string;
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
  position: { x: number; y: number };
};
export type IEntity = {
  id: string;
  name: string;
  kind: 'socket' | 'access';
  owner: IOwner;
  description: string;
  source: ISource;
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
export type IGraphScope = {
  repos: readonly IRepo[];
  tables: readonly ITable[];
  entities: readonly IEntity[];
  connections: readonly IConnection[];
};
export type IRow = Record<string, unknown>;
export type IRows = Record<string, readonly IRow[]>;
export type ISnapshot = {
  rows: IRows;
};
