import { describe, expect, it } from 'vitest';

import {
  connections,
  entities,
  repos,
  schemaCaptureSummary,
  systemOverviewScope,
  tables,
} from './data/architecture';
import schemaSnapshot from './data/schema-snapshot.json';

const expectedTableCounts = {
  system: 8,
  log: 5,
  ac: 5,
  avr: 7,
  avc: 4,
  aavr: 5,
  aavc: 2,
  sc: 2,
  svr: 7,
  svc: 4,
  savr: 5,
  savc: 1,
  'aggregate-node': 2,
  'service-node': 2,
  'aggregate-session': 3,
  session: 3,
};

describe('single infrastructure canvas and schema boundaries', () => {
  it('lists the 12 production repos, concrete Nodes and both session databases', () => {
    expect(repos.map(repo => repo.id).sort()).toEqual(
      Object.keys(expectedTableCounts).sort(),
    );
    expect(repos.filter(repo => repo.repoType !== undefined)).toHaveLength(12);
    expect(new Set(repos.map(repo => repo.owner))).toEqual(
      new Set(['system', 'aggregate', 'service', 'browser']),
    );
    expect(entities.map(entity => [entity.id, entity.kind])).toEqual([
      ['service-socket', 'socket'],
      ['aggregate-socket', 'socket'],
      ['service-access', 'access'],
      ['aggregate-access', 'access'],
    ]);
    expect(systemOverviewScope.repos).toEqual(repos);
    expect(systemOverviewScope.entities).toEqual(entities);
    expect(systemOverviewScope.tables).toEqual(tables);
    expect(systemOverviewScope.tables).toHaveLength(65);
    expect(
      new Set(systemOverviewScope.tables.map(table => table.id)).size,
    ).toBe(65);
    expect(
      Object.fromEntries(
        repos.map(repo => [
          repo.id,
          systemOverviewScope.tables.filter(table => table.repoId === repo.id)
            .length,
        ]),
      ),
    ).toEqual(expectedTableCounts);
  });

  it('keeps every connection on the canvas with valid component or table endpoints', () => {
    const routes = connections.filter(
      connection => connection.kind !== 'relationship',
    );
    expect(systemOverviewScope.connections).toEqual(connections);
    expect(new Set(connections.map(connection => connection.id)).size).toBe(
      connections.length,
    );
    const nodeIds = new Set(
      [...repos, ...entities, ...tables].map(node => node.id),
    );
    for (const connection of systemOverviewScope.connections) {
      expect(nodeIds.has(connection.source)).toBe(true);
      expect(nodeIds.has(connection.destination)).toBe(true);
    }
    const componentIds = new Set(
      [...repos, ...entities].map(component => component.id),
    );
    for (const connection of routes) {
      expect(componentIds.has(connection.source)).toBe(true);
      expect(componentIds.has(connection.destination)).toBe(true);
      expect(connection.sourceColumn).toBeUndefined();
      expect(connection.destinationColumn).toBeUndefined();
    }
  });

  it('separates local-only execution from complete aggregate and service staging delivery', () => {
    expect(
      connections
        .filter(connection => connection.kind === 'session-execute')
        .map(connection => [connection.source, connection.destination]),
    ).toEqual([['aggregate-session', 'aggregate-session']]);
    const staged = connections.filter(
      connection => connection.kind === 'session-stage',
    );
    for (const path of [
      [
        'aggregate-session',
        'aggregate-node',
        'aggregate-socket',
        'aavc',
        'aavr',
        'ac',
        'avr',
      ],
      ['session', 'service-node', 'service-socket', 'savc', 'sc', 'svr'],
    ]) {
      for (let index = 1; index < path.length; index += 1) {
        expect(
          staged.some(
            connection =>
              connection.source === path[index - 1] &&
              connection.destination === path[index],
          ),
        ).toBe(true);
      }
    }
  });

  it('preserves every captured infrastructure table, column, index and source owner', () => {
    expect(Object.keys(schemaSnapshot).sort()).toEqual(
      Object.keys(expectedTableCounts).sort(),
    );
    expect(
      Object.fromEntries(
        Object.entries(schemaSnapshot).map(([repoId, declarations]) => [
          repoId,
          declarations.length,
        ]),
      ),
    ).toEqual(expectedTableCounts);
    const capturedTables = Object.entries(schemaSnapshot).flatMap(
      ([repoId, declarations]) =>
        declarations.map(table => ({
          ...table,
          id: `${repoId}/${table.name}`,
          repoId,
        })),
    );
    expect(
      [...tables].sort((left, right) => left.id.localeCompare(right.id)),
    ).toMatchObject(
      capturedTables.sort((left, right) => left.id.localeCompare(right.id)),
    );
    expect(schemaCaptureSummary).toMatchObject({
      productionRepoTypes: 12,
      productionBaseTables: 55,
      visibleTables: 65,
      visibleColumns: 639,
    });
    for (const table of tables) {
      expect(table.source.path).toMatch(/^packages\//);
      expect(table.source.line).toBeGreaterThan(0);
      expect(table.purpose?.length).toBeGreaterThan(10);
      expect(table.description).toContain(table.purpose);
    }
  });

  it('keeps each declared reference on the canvas with valid column endpoints', () => {
    const references = connections.filter(
      connection => connection.kind === 'relationship',
    );
    const declaredColumns = tables.flatMap(table =>
      table.columns.flatMap(column =>
        column.reference === undefined ? [] : [{ table, column }],
      ),
    );
    expect(references).toHaveLength(3);
    expect(references).toHaveLength(declaredColumns.length);
    for (const { table, column } of declaredColumns) {
      const destinationId = `${table.repoId}/${column.reference?.table}`;
      const reference = references.find(
        connection => connection.id === `ref:${table.id}:${column.name}`,
      );
      expect(reference).toMatchObject({
        source: table.id,
        destination: destinationId,
        sourceColumn: column.name,
        destinationColumn: column.reference?.column,
      });
      expect(
        tables
          .find(candidate => candidate.id === destinationId)
          ?.columns.some(
            candidate => candidate.name === column.reference?.column,
          ),
      ).toBe(true);
      expect(
        systemOverviewScope.connections.filter(
          connection => connection.id === reference?.id,
        ),
      ).toHaveLength(1);
      expect(
        systemOverviewScope.tables.some(candidate => candidate.id === table.id),
      ).toBe(true);
      expect(
        systemOverviewScope.tables.some(
          candidate => candidate.id === destinationId,
        ),
      ).toBe(true);
    }
  });

  it('contains generic identities and package schemas without Shopping fixtures', () => {
    const displayedData = JSON.stringify({
      repos,
      entities,
      tables,
      connections,
    });
    expect(displayedData).not.toMatch(
      /shopping|marketplace|purchase|payment|catalog-session|promotion|acct_user_alice|examples\//i,
    );
    for (const repo of repos) {
      expect(repo.identity).not.toContain('=');
      expect(repo.source.path).toMatch(/^packages\//);
    }
  });

  it('retains the version-free AggregateChain identity and its five infrastructure tables', () => {
    expect(
      systemOverviewScope.repos.find(repo => repo.id === 'ac')?.identity,
    ).toBe('systemId; aggregateName; aggregateId');
    expect(
      systemOverviewScope.tables
        .filter(table => table.repoId === 'ac')
        .map(table => table.name)
        .sort(),
    ).toEqual([
      'aggregateVersionRepos',
      'asyncOperations',
      'commands',
      'modelOperations',
      'results',
    ]);
  });
});
