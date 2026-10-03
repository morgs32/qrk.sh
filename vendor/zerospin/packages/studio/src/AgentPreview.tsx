import { useSyncExternalStore } from 'react';

import {
  makeAgentDbConfig,
  makeAgentQuery,
} from '@zerospin/core/agent/agentPreviewDb';
import type { IAgentSession } from '@zerospin/core/agent/types';
import { useLiveQuery } from '@zerospin/react/useLiveQuery';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './components/ui/table.js';

export function AgentPreview({ session }: { session: IAgentSession }) {
  const state = useSyncExternalStore(
    session.store.subscribe,
    session.store.getState,
    session.store.getState,
  );
  return (
    <section className="space-y-3" aria-label="Agent preview">
      <h2 className="text-lg font-semibold">{session.agent.name}</h2>
      <p>
        Aggregate {session.agent.aggregateName}@{session.agent.aggregateVersion}{' '}
        · {session.aggregateId} · Actor {session.agent.actorName}@
        {session.agent.actorVersion}
      </p>
      <p role="status">Connection: {state.status}</p>
      {state.error !== null && (
        <p role="alert">
          {state.error.message}
          {state.isInitialized ? ' — retained rows may be stale.' : ''}
        </p>
      )}
      {!state.isInitialized && state.status !== 'error' && (
        <p>Loading agent snapshot…</p>
      )}
      {state.db !== null && <AgentResults session={session} />}
    </section>
  );
}

function display(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (value instanceof Date) return value.toISOString();
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}
function AgentResults({ session }: { session: IAgentSession }) {
  const result = useLiveQuery({
    session,
    query: db =>
      makeAgentQuery(db, makeAgentDbConfig(session.agent), session.agent),
    tableNames: [session.agent.query.modelName],
  });
  const model = session.agent.models[session.agent.query.modelName];
  const columns = Object.keys(model?.properties ?? {});
  return (
    <>
      <p>
        {result.data?.length ?? 0} results · Last query update:{' '}
        {result.updatedAt?.toLocaleTimeString() ?? 'pending'}
      </p>
      {result.error !== undefined && (
        <p role="alert">Query failed: {result.error.message}</p>
      )}
      {result.updatedAt === undefined ? (
        <p>Loading query…</p>
      ) : result.data.length === 0 ? (
        <p>No matching rows.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map(column => (
                <TableHead key={column}>{column}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {result.data.map((row, index) => (
              <TableRow key={String(row.id ?? index)}>
                {columns.map(column => (
                  <TableCell key={column}>{display(row[column])}</TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </>
  );
}
