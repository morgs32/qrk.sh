import { useState } from 'react';

import { entities, repos, tables } from './data/architecture';
import { contracts } from './data/scenarios';
import { ownerColors, ownerNames } from './diagram';
import type { IContract, IRow, ISnapshot, ISource, ITable } from './types';

function Source({ source }: { source: ISource }) {
  return (
    <div className="source-reference">
      <span className="eyebrow">SOURCE SNAPSHOT</span>
      <code>
        {source.path}
        {source.line ? `:${source.line}` : ''}
      </code>
      {source.note && <p>{source.note}</p>}
      <p>Captured from this checkout. Example rows are walkthrough fixtures.</p>
    </div>
  );
}

function format(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return '—';
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

function Rows({
  rows,
  previous,
  name,
  table,
}: {
  rows: readonly IRow[];
  previous?: readonly IRow[];
  name: string;
  table: ITable;
}) {
  const columns = [...new Set(rows.flatMap(row => Object.keys(row)))];
  if (rows.length === 0) {
    return (
      <div className="empty-rows">
        No example rows in <code>{name}</code> at this point.
      </div>
    );
  }
  return (
    <div className="rows-scroll">
      <table className="rows-table">
        <thead>
          <tr>
            {columns.map(column => (
              <th key={column}>{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index}>
              {columns.map(column => {
                const primaryKey = table.columns
                  .filter(column => column.primaryKey)
                  .map(column => column.name);
                const declaredKey = table.indexes?.find(
                  key =>
                    key.unique &&
                    key.columns.every(column => row[column] !== undefined),
                )?.columns;
                const identity =
                  primaryKey.length > 0 &&
                  primaryKey.every(column => row[column] !== undefined)
                    ? primaryKey
                    : (declaredKey ??
                      (row.id !== undefined
                        ? ['id']
                        : row.commandId !== undefined &&
                            row.operationIndex !== undefined
                          ? ['commandId', 'operationIndex']
                          : []));
                const old =
                  identity.length > 0
                    ? previous?.find(candidate =>
                        identity.every(
                          column =>
                            format(candidate[column]) === format(row[column]),
                        ),
                      )
                    : previous?.[index];
                const changed =
                  previous !== undefined &&
                  format(old?.[column]) !== format(row[column]);
                return (
                  <td
                    key={column}
                    className={changed ? 'cell-changed' : ''}
                    title={format(row[column])}
                  >
                    <code>{format(row[column])}</code>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TableDetails({
  table,
  snapshot,
}: {
  table: ITable;
  snapshot: ISnapshot;
}) {
  const [tab, setTab] = useState<'rows' | 'schema' | 'source'>('rows');
  const rows = snapshot.rows[table.id] ?? [];
  const previous = snapshot.previousRows[table.id] ?? [];
  const changed = snapshot.changedTableIds.includes(table.id);
  return (
    <>
      <div className="inspector-tabs" role="tablist" aria-label="Table details">
        {(['rows', 'schema', 'source'] as const).map(name => (
          <button
            key={name}
            role="tab"
            aria-selected={tab === name}
            onClick={() => setTab(name)}
          >
            {name === 'rows' ? `Rows · ${rows.length}` : name}
          </button>
        ))}
      </div>
      {tab === 'rows' && (
        <>
          <p className="inspector-description">
            {table.description ??
              'Example state retained by this table at the selected walkthrough step.'}
          </p>
          {changed && (
            <div className="change-banner">
              ↳ Changed at this step
              {snapshot.step?.phase === 'transaction' ? ' · atomic commit' : ''}
            </div>
          )}
          <h4>{changed ? 'After' : 'Current example rows'}</h4>
          <Rows
            rows={rows}
            previous={changed ? previous : undefined}
            name={table.name}
            table={table}
          />
          {changed && (
            <>
              <h4>Before</h4>
              <Rows rows={previous} name={table.name} table={table} />
            </>
          )}
          <p className="inspector-footnote">
            Showing selected fixture fields, not a live database.
          </p>
        </>
      )}
      {tab === 'schema' && (
        <>
          <p className="inspector-description">
            {table.columns.length} columns ·{' '}
            {table.illustrative
              ? 'illustrative declaration'
              : 'current source declaration'}
          </p>
          <div className="schema-list">
            {table.columns.map(column => (
              <div className="schema-field" key={column.name}>
                <div>
                  <strong>{column.name}</strong>
                  <code>{column.type}</code>
                </div>
                <p>
                  {[
                    column.primaryKey && 'Primary key',
                    column.unique && 'Unique',
                    column.nullable ? 'Nullable' : 'Required',
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                  {column.reference && (
                    <span className="reference-field">
                      ↗ {column.reference.table}.{column.reference.column}
                    </span>
                  )}
                </p>
              </div>
            ))}
          </div>
          {table.indexes && table.indexes.length > 0 && (
            <>
              <h4>Indexes</h4>
              {table.indexes.map(index => (
                <div className="index-definition" key={index.name}>
                  <code>{index.name}</code>
                  <p>
                    {index.columns.join(' + ')}
                    {index.unique ? ' · unique' : ''}
                  </p>
                </div>
              ))}
            </>
          )}
        </>
      )}
      {tab === 'source' && <Source source={table.source} />}
    </>
  );
}

function ContractDetails({
  contract,
  onSelect,
}: {
  contract: IContract;
  onSelect: (id: string) => void;
}) {
  const mapping = contracts.find(item => item.id === contract.mapping);
  const mappingIsOriginal = mapping?.role.toLowerCase().includes('original');
  return (
    <>
      <p className="inspector-description">{contract.description}</p>
      <h4>Payload</h4>
      <pre>{JSON.stringify(contract.payload, null, 2)}</pre>
      <h4>Result</h4>
      <pre>{JSON.stringify(contract.result, null, 2)}</pre>
      <h4>Emitted operations</h4>
      <ol className="operation-list">
        {contract.operations.map((operation, index) => (
          <li key={index}>
            <code>{operation}</code>
          </li>
        ))}
      </ol>
      <h4>Contract program outline</h4>
      <pre className="program-code">{contract.program}</pre>
      {mapping && (
        <>
          <h4>{mappingIsOriginal ? 'Original contract' : 'Server mapping'}</h4>
          <p className="inspector-description">{mapping.description}</p>
          <pre className="program-code">{mapping.program}</pre>
          <button
            className="mapping-button"
            onClick={() =>
              onSelect(
                entities.find(entity => entity.contractId === mapping.id)?.id ??
                  mapping.id,
              )
            }
          >
            Open {mappingIsOriginal ? 'original contract' : 'server mapping'} ↗
          </button>
        </>
      )}
      <Source source={contract.source} />
    </>
  );
}

export function Inspector({
  selectedId,
  snapshot,
  onSelect,
  onClose,
}: {
  selectedId: string | null;
  snapshot: ISnapshot;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const table = tables.find(item => item.id === selectedId);
  const repo = repos.find(item => item.id === (table?.repoId ?? selectedId));
  const entity = entities.find(item => item.id === selectedId);
  const contract = contracts.find(
    item => item.id === (entity?.contractId ?? selectedId),
  );
  const title =
    table?.name ??
    (contract ? `${contract.name}@${contract.version}` : undefined) ??
    entity?.name ??
    repo?.name ??
    'Read the system';
  const owner = repo?.owner ?? entity?.owner;
  return (
    <aside
      className={`inspector ${selectedId ? 'has-selection' : ''}`}
      aria-label="Selection inspector"
    >
      <header className="inspector-header">
        <div>
          <span className="eyebrow">
            {table
              ? 'TABLE INSPECTOR'
              : contract
                ? contract.role
                : repo
                  ? 'REPO INSPECTOR'
                  : 'SYSTEM EXPLORER'}
          </span>
          <h2>{title}</h2>
        </div>
        {selectedId && (
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="Close inspector"
          >
            ×
          </button>
        )}
      </header>
      <div className="inspector-content">
        {owner && (
          <div className="owner-badge" style={{ color: ownerColors[owner] }}>
            {ownerNames[owner]}
          </div>
        )}
        {(table?.illustrative ||
          entity?.illustrative ||
          repo?.illustrative ||
          contract?.illustrative) && (
          <p className="illustrative-banner">
            Illustrative checkout example. This is not a deployed Shopping
            definition.
          </p>
        )}
        {table ? (
          <TableDetails key={table.id} table={table} snapshot={snapshot} />
        ) : contract ? (
          <ContractDetails contract={contract} onSelect={onSelect} />
        ) : repo ? (
          <>
            <p className="inspector-description">{repo.description}</p>
            <h4>Owner identity</h4>
            <pre>{repo.identity}</pre>
            <h4>Owned tables</h4>
            <div className="repo-table-list">
              {tables
                .filter(item => item.repoId === repo.id)
                .map(item => (
                  <button key={item.id} onClick={() => onSelect(item.id)}>
                    <span>▤ {item.name}</span>
                    <span>{snapshot.rows[item.id]?.length ?? 0} rows ↗</span>
                  </button>
                ))}
            </div>
            <Source source={repo.source} />
          </>
        ) : entity ? (
          <>
            <p className="inspector-description">{entity.description}</p>
            <Source source={entity.source} />
          </>
        ) : (
          <>
            <div className="overview-illustration">
              <span>Session</span>
              <i>→</i>
              <span>Chain</span>
              <i>→</i>
              <span>Repo</span>
              <i>↳</i>
              <span>History</span>
            </div>
            <p className="inspector-description">
              Every Repo and Chain, every table, and the path a command takes
              between them.
            </p>
            <div className="overview-statistics">
              <div>
                <strong>12</strong>
                <span>production classes</span>
              </div>
              <div>
                <strong>{tables.length}</strong>
                <span>table instances</span>
              </div>
            </div>
            <h4>Start exploring</h4>
            <p className="inspector-description">
              Choose a walkthrough below. Click a table to inspect its rows, or
              use search to find a column. Double-click a card to zoom in.
            </p>
            <div className="inspector-note">
              Current Shopping writes carts through the marketplace service. The
              purchase walkthrough demonstrates aggregate and async machinery
              using illustrative checkout definitions.
            </div>
            <h4>Ownership matters</h4>
            <p className="inspector-description">
              VersionRepos execute commands. ActorRepos compute selected
              projections. Chains retain admission and publication history.
              Provider work starts after the authoritative transaction.
            </p>
          </>
        )}
      </div>
    </aside>
  );
}
