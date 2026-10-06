import { useState, useSyncExternalStore, type ReactNode } from 'react';

import type {
  IAgentSession,
  IAgentSessionDefinition,
} from '@zerospin/core/agent/types';
import { sessionRepoDbConfig } from '@zerospin/core/aggregateSession/sessionRepoDbConfig';
import { stageCommand } from '@zerospin/core/aggregateSession/stageCommand/stageCommand';
import { AdmissionResultSchema } from '@zerospin/core/contracts/AdmissionResultSchema';
import { ExecutionResultSchema } from '@zerospin/core/contracts/ExecutionResultSchema';
import type { IContract } from '@zerospin/core/contracts/types';
import type { ISelection } from '@zerospin/core/models/make/makeActorDbVersion';
import type { IAgentSpec } from '@zerospin/core/system/types';
import { ShapeForm } from '@zerospin/react/primitives';
import '@zerospin/react/primitives.css';
import { useLiveQueryOnDb } from '@zerospin/react/useLiveQueryOnDb';
import { getTableColumns } from 'drizzle-orm';
import { Schema } from 'effect';

import { Button } from './components/ui/button.js';
import {
  JsonInspector,
  TableBrowser,
  TableInspector,
  type IJsonCell,
} from './TableBrowser.js';

type ICommandRow = {
  sessionIndex: number;
  id: string;
  commandName: string;
  admission: string | null;
  execution: string | null;
  executedIndex: number | null;
  admissionIndex: number | null;
};
type IInspector =
  | { kind: 'json'; cell: IJsonCell }
  | { kind: 'command'; contractName: string; rowId: string; rowNumber: number }
  | null;

function readRows(
  selection: ISelection,
  db: Parameters<ISelection['all']>[0],
  aggregateId: string,
): readonly Record<string, unknown>[] {
  const decoded = Schema.decodeUnknownSync(
    Schema.Array(selection.model.table.codec),
  )(selection.all(db, { aggregateId }));
  return Schema.decodeUnknownSync(
    Schema.Array(Schema.Record(Schema.String, Schema.Unknown)),
  )(decoded);
}

export function AgentPreview<DEFINITION extends IAgentSessionDefinition>({
  session,
  agent,
  breadcrumbs,
}: {
  session: IAgentSession<DEFINITION>;
  agent: IAgentSpec;
  breadcrumbs?: ReactNode;
}) {
  const state = useSyncExternalStore(
    session.store.subscribe,
    session.store.getState,
    session.store.getState,
  );
  const connection = useSyncExternalStore(
    session.connection.subscribe,
    session.connection.getState,
    session.connection.getState,
  );
  const header = (
    <>
      {breadcrumbs ?? (
        <>
          <a
            className="text-muted-foreground hover:text-foreground"
            href="/agents"
          >
            Agents
          </a>
          <span className="text-muted-foreground">/</span>
          <span>
            {agent.aggregateName}@{agent.aggregateVersion}
          </span>
          <span className="text-muted-foreground">/</span>
          <span className="min-w-0 truncate font-mono">
            {state.aggregateId ?? 'opening'}
          </span>
          <span className="text-muted-foreground">/</span>
          <span>{agent.name}</span>
        </>
      )}
      <span
        role="status"
        className="ml-auto shrink-0 text-xs text-muted-foreground"
      >
        Connection: {connection.status}
      </span>
    </>
  );
  const connectionError =
    connection.error === null
      ? null
      : `${connection.error.message}${state.isInitialized ? ' — retained rows may be stale.' : ''}`;
  const names = Object.keys(session.definition.capturedSelections);
  if (state.db === null || state.aggregateId === null || names.length === 0) {
    return (
      <TableBrowser
        breadcrumbs={header}
        sidebarLabel="Selections"
        names={names}
        selectedName={names[0] ?? null}
        onSelect={() => undefined}
        columns={[]}
        rows={[]}
        loading={state.db === null && connection.status !== 'error'}
        error={connectionError}
        onRefresh={() => undefined}
        status={
          <span className="text-xs text-muted-foreground">
            {names.length === 0
              ? 'No selections declared.'
              : 'Loading agent snapshot…'}
          </span>
        }
        onInspectJson={() => undefined}
      />
    );
  }
  return (
    <AgentResults
      key={`${agent.name}:${state.aggregateId}`}
      session={session}
      db={state.db}
      aggregateId={state.aggregateId}
      breadcrumbs={header}
      connectionError={connectionError}
      ready={connection.status === 'live' && state.sessionStatus === 'current'}
    />
  );
}

function AgentResults<DEFINITION extends IAgentSessionDefinition>({
  session,
  db,
  aggregateId,
  breadcrumbs,
  connectionError,
  ready,
}: {
  session: IAgentSession<DEFINITION>;
  db: NonNullable<
    ReturnType<IAgentSession<DEFINITION>['store']['getState']>['db']
  >;
  aggregateId: string;
  breadcrumbs: ReactNode;
  connectionError: string | null;
  ready: boolean;
}) {
  const names = Object.keys(session.definition.capturedSelections);
  const [selectedName, setSelectedName] = useState(names[0] ?? null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [inspector, setInspector] = useState<IInspector>(null);
  const selection =
    selectedName === null
      ? undefined
      : session.definition.capturedSelections[selectedName];
  const rows = useLiveQueryOnDb({
    db,
    key: `${selectedName ?? ''}:${refreshKey}`,
    tableNames: Object.keys(selection?.models ?? {}),
    query: db => {
      const result: readonly Record<string, unknown>[] = [];
      return {
        _: { result },
        all: () =>
          selection === undefined
            ? result
            : readRows(selection, db, aggregateId),
      };
    },
  });
  const journal = useLiveQueryOnDb({
    db,
    tableNames: ['commands'],
    query: db =>
      db
        .select()
        .from(sessionRepoDbConfig.schema.commands)
        .orderBy(sessionRepoDbConfig.schema.commands.sessionIndex),
  });
  const pending =
    journal.data?.some(command => command.executedIndex === null) ?? false;
  const bindings = Object.entries(session.definition.contractBindings).filter(
    ([, binding]) => binding.model === selection?.model,
  );
  const selectedRow =
    inspector?.kind === 'command'
      ? rows.data?.find(row => row.id === inspector.rowId)
      : undefined;
  const columns =
    selection === undefined
      ? []
      : Object.values(getTableColumns(selection.model.drizzleSchema)).map(
          column => ({
            name: column.name,
            type: column.getSQLType(),
            isPrimaryKey: column.primary,
          }),
        );
  const errors = [connectionError, rows.error?.message, journal.error?.message]
    .filter(message => message !== undefined && message !== null)
    .join(' · ');
  return (
    <TableBrowser
      breadcrumbs={breadcrumbs}
      sidebarLabel="Selections"
      names={names}
      selectedName={selectedName}
      onSelect={name => {
        setSelectedName(name);
        setInspector(null);
      }}
      columns={columns}
      rows={rows.data ?? []}
      loading={rows.updatedAt === undefined}
      error={errors || null}
      onRefresh={() => setRefreshKey(key => key + 1)}
      status={
        <span role="status" className="text-xs text-muted-foreground">
          {rows.data?.length ?? 0} results
        </span>
      }
      emptyMessage="No matching rows."
      actions={
        bindings.length === 0
          ? undefined
          : (row, rowNumber) => (
              <div className="flex gap-2">
                {bindings.map(([contractName]) => (
                  <Button
                    key={contractName}
                    size="sm"
                    variant="outline"
                    aria-label={`${contractName} for ${String(row.id)}`}
                    onClick={() =>
                      setInspector({
                        kind: 'command',
                        contractName,
                        rowId: String(row.id),
                        rowNumber,
                      })
                    }
                  >
                    {contractName}
                  </Button>
                ))}
              </div>
            )
      }
      selectedJsonCell={inspector?.kind === 'json' ? inspector.cell : null}
      onInspectJson={cell => setInspector({ kind: 'json', cell })}
      inspector={
        inspector?.kind === 'json' ? (
          <JsonInspector
            cell={inspector.cell}
            onClose={() => setInspector(null)}
          />
        ) : inspector?.kind === 'command' && selection !== undefined ? (
          <CommandPanel
            key={`${selectedName}:${inspector.rowId}:${inspector.contractName}`}
            session={session}
            selection={selection}
            contractName={inspector.contractName}
            rowId={inspector.rowId}
            rowNumber={inspector.rowNumber}
            row={selectedRow}
            commands={journal.data ?? []}
            disabled={
              !ready ||
              pending ||
              selectedRow === undefined ||
              rows.error !== undefined ||
              journal.error !== undefined
            }
            onClose={() => setInspector(null)}
          />
        ) : null
      }
    />
  );
}

function commandStatus(command: ICommandRow): ReactNode {
  const admission =
    command.admission === null
      ? null
      : Schema.decodeUnknownSync(Schema.fromJsonString(AdmissionResultSchema))(
          command.admission,
        );
  const execution =
    command.execution === null
      ? null
      : Schema.decodeUnknownSync(Schema.fromJsonString(ExecutionResultSchema))(
          command.execution,
        );
  if (admission?.status === 'failed') {
    return <span role="alert">Rejected — {admission.failure.message}</span>;
  }
  if (execution?.status === 'failed') {
    return <span role="alert">Rejected — {execution.failure.message}</span>;
  }
  if (command.executedIndex !== null) return 'Confirmed';
  return command.admissionIndex === null
    ? 'Staged locally — delivery pending'
    : 'Admitted — awaiting aggregate result';
}

function display(value: unknown): string {
  if (value === null || value === undefined) return 'NULL';
  if (value instanceof Date) return value.toISOString();
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

function CommandPanel<DEFINITION extends IAgentSessionDefinition>({
  session,
  selection,
  contractName,
  rowId,
  rowNumber,
  row,
  commands,
  disabled,
  onClose,
}: {
  session: IAgentSession<DEFINITION>;
  selection: ISelection;
  contractName: string;
  rowId: string;
  rowNumber: number;
  row: Record<string, unknown> | undefined;
  commands: readonly ICommandRow[];
  disabled: boolean;
  onClose: () => void;
}) {
  const [commandId, setCommandId] = useState<string | null>(null);
  const contract: IContract | undefined =
    session.definition.contracts[contractName];
  const binding = session.definition.contractBindings[contractName];
  if (contract === undefined || binding === undefined) return null;
  const shape = Object.fromEntries(
    Object.entries(contract.payload).filter(
      ([field]) => !Object.hasOwn(binding.bind, field),
    ),
  );
  const command = commands.find(command => command.id === commandId);
  return (
    <TableInspector
      title={contractName}
      subtitle={`Row ${rowNumber}`}
      label="command inspector"
      onClose={onClose}
    >
      <div className="space-y-4">
        <dl className="grid gap-2" aria-label="Bound payload values">
          {Object.entries(binding.bind).map(([field, rowField]) => (
            <div key={field} className="grid gap-1">
              <dt className="text-xs text-muted-foreground">
                {field} ← {rowField}
              </dt>
              <dd data-bound-field={field} className="break-all font-mono">
                {row === undefined ? 'Row unavailable' : display(row[rowField])}
              </dd>
            </div>
          ))}
        </dl>
        {row === undefined && (
          <p role="status">This row is no longer in the selection.</p>
        )}
        {disabled && row !== undefined && (
          <p role="status">
            Submission is disabled until the session is live and delivery is
            resolved.
          </p>
        )}
        <ShapeForm
          shape={shape}
          disabled={disabled}
          onSubmit={editable => {
            const state = session.store.getState();
            if (
              disabled ||
              session.connection.getState().status !== 'live' ||
              state.sessionStatus !== 'current' ||
              state.db === null ||
              state.aggregateId === null ||
              state.db
                .select()
                .from(sessionRepoDbConfig.schema.commands)
                .all()
                .some(command => command.executedIndex === null)
            ) {
              throw new Error('The session is not ready for another command.');
            }
            const latest = readRows(
              selection,
              state.db,
              state.aggregateId,
            ).find(row => row.id === rowId);
            if (latest === undefined) {
              throw new Error('This row is no longer in the selection.');
            }
            const bound = Object.fromEntries(
              Object.entries(binding.bind).map(([field, rowField]) => [
                field,
                latest[rowField],
              ]),
            );
            const executionSession: IAgentSession = session;
            const result = stageCommand({
              session: executionSession,
              contractName,
              payload: { ...editable, ...bound },
            });
            if (result._tag === 'Failure') {
              throw new Error(result.failure.message);
            }
            setCommandId(result.success.id);
          }}
        />
        {command !== undefined && (
          <p
            role="status"
            data-command-id={command.id}
            data-session-index={command.sessionIndex}
          >
            {contractName}: {commandStatus(command)}
          </p>
        )}
        <ul className="space-y-1 border-t pt-3" aria-label="Session commands">
          {commands
            .filter(entry => entry.sessionIndex !== command?.sessionIndex)
            .map(entry => (
              <li
                key={entry.sessionIndex}
                data-command-id={entry.id}
                data-session-index={entry.sessionIndex}
              >
                {entry.commandName}: {commandStatus(entry)}
              </li>
            ))}
        </ul>
      </div>
    </TableInspector>
  );
}
