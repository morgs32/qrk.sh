import { useEffect, useState } from 'react';

import type { IAgentSession } from '@zerospin/core/agent/types';
import { SystemSpecSchema } from '@zerospin/core/system/SystemSpecSchema';
import { Schema } from 'effect';
import { Link, useNavigate, useParams } from 'react-router';
import { agents as sessions } from 'virtual:zerospin-studio-agents';

import { AgentPreview } from './AgentPreview.js';
import { useAgentAggregateIds } from './useAgentAggregateIds.js';

const system = Schema.decodeUnknownSync(
  Schema.fromJsonString(SystemSpecSchema),
)(import.meta.env.ZEROSPIN_SYSTEM_SPEC);
const bootstrapSchema = Schema.Struct({
  snapshot: Schema.Unknown,
  webSocketUrl: Schema.String,
  outcomes: Schema.Unknown,
  resolvedThrough: Schema.Number.check(
    Schema.isInt(),
    Schema.isGreaterThanOrEqualTo(0),
  ),
});

async function readJson(response: Response): Promise<unknown> {
  const data: unknown = await response.json();
  if (!response.ok) {
    const error = Schema.decodeUnknownSync(
      Schema.Struct({ error: Schema.String }),
    )(data);
    throw new Error(error.error);
  }
  return data;
}
const path = (...segments: string[]) =>
  `/agents/${segments.map(encodeURIComponent).join('/')}`;

export function AgentExplorer() {
  const { aggregateName, aggregateVersion, aggregateId, agentName } =
    useParams();
  const navigate = useNavigate();
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [session, setSession] = useState<{
    selection: string;
    value: IAgentSession;
  } | null>(null);
  const aggregate =
    aggregateName === undefined || aggregateVersion === undefined
      ? undefined
      : system.aggregates[aggregateName]?.[aggregateVersion];
  const agents = Object.values(system.agents).filter(
    agent =>
      agent.aggregateName === aggregateName &&
      agent.aggregateVersion === aggregateVersion,
  );
  const agent = agents.find(candidate => candidate.name === agentName);
  const {
    data,
    error,
    isLoading: loading,
    mutate,
  } = useAgentAggregateIds({
    aggregateName,
    aggregateVersion,
    enabled: aggregate !== undefined && agents.length > 0,
  });
  const ids = data ?? [];

  useEffect(() => {
    setSession(null);
    setSessionError(null);
    if (agent === undefined || aggregateId === undefined) return;
    const next = sessions[agent.name];
    if (next === undefined) {
      setSessionError(
        `No browser-safe session exported for ${agent.name} in agents.ts.`,
      );
      return;
    }
    setSession({ selection: `${agent.name}:${aggregateId}`, value: next });
    void next
      .initialize({
        aggregateId,
        bootstrap: async ({ signal, nodeId }) => {
          const params = new URLSearchParams({
            agentName: agent.name,
            aggregateId,
            nodeId,
          });
          const data = await readJson(
            await fetch(`/api/agents/open?${params}`, {
              signal,
              cache: 'no-store',
            }),
          );
          return Schema.decodeUnknownSync(bootstrapSchema)(data);
        },
      })
      .catch(() => undefined);
    return () => {
      void next.dispose();
    };
  }, [agent, aggregateId]);

  if (
    session !== null &&
    agent !== undefined &&
    aggregateId !== undefined &&
    session.selection === `${agent.name}:${aggregateId}`
  ) {
    return (
      <AgentPreview
        key={`${agent.name}:${aggregateId}`}
        agent={agent}
        session={session.value}
        breadcrumbs={
          <>
            <Link
              className="text-muted-foreground hover:text-foreground"
              to="/"
            >
              Studio
            </Link>
            <span className="text-muted-foreground">/</span>
            <Link
              className="text-muted-foreground hover:text-foreground"
              to="/agents"
            >
              Agents
            </Link>
            <span className="text-muted-foreground">/</span>
            <Link
              className="text-muted-foreground hover:text-foreground"
              to={path(agent.aggregateName, agent.aggregateVersion)}
            >
              {agent.aggregateName}@{agent.aggregateVersion}
            </Link>
            <span className="text-muted-foreground">/</span>
            <Link
              className="min-w-0 truncate font-mono text-muted-foreground hover:text-foreground"
              to={path(
                agent.aggregateName,
                agent.aggregateVersion,
                aggregateId,
              )}
            >
              {aggregateId}
            </Link>
            <span className="text-muted-foreground">/</span>
            <span>{agent.name}</span>
          </>
        }
      />
    );
  }

  return (
    <main className="space-y-6 p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Aggregate agent sessions</h1>
        <Link to="/" className="underline">
          Studio home
        </Link>
      </header>
      <p className="text-sm text-muted-foreground">
        An admin session runs in memory while this view is open. Commands stage
        locally and push to the aggregate.
      </p>
      <div className="flex flex-wrap gap-4">
        <label className="grid gap-2">
          Aggregate type / version
          <select
            aria-label="Aggregate type / version"
            className="rounded border p-2"
            value={
              aggregate === undefined
                ? ''
                : `${aggregate.name}@${aggregate.version}`
            }
            onChange={event => {
              const selected = Object.values(system.aggregates)
                .flatMap(versions => Object.values(versions))
                .find(
                  candidate =>
                    `${candidate.name}@${candidate.version}` ===
                    event.target.value,
                );
              navigate(
                selected === undefined
                  ? '/agents'
                  : path(selected.name, selected.version),
              );
            }}
          >
            <option value="">Select aggregate</option>
            {Object.values(system.aggregates)
              .flatMap(versions => Object.values(versions))
              .map(candidate => (
                <option key={`${candidate.name}@${candidate.version}`}>
                  {candidate.name}@{candidate.version}
                </option>
              ))}
          </select>
        </label>
        <label className="grid gap-2">
          Aggregate ID
          <select
            aria-label="Aggregate ID"
            className="rounded border p-2"
            disabled={aggregate === undefined || loading || ids.length === 0}
            value={aggregateId ?? ''}
            onChange={event => {
              if (aggregate !== undefined) {
                navigate(
                  path(aggregate.name, aggregate.version, event.target.value),
                );
              }
            }}
          >
            <option value="">
              {loading ? 'Loading aggregate IDs…' : 'Select aggregate ID'}
            </option>
            {ids.map(id => (
              <option key={id}>{id}</option>
            ))}
          </select>
        </label>
        <label className="grid gap-2">
          Declared agent
          <select
            aria-label="Declared agent"
            className="rounded border p-2"
            disabled={aggregateId === undefined}
            value={agentName ?? ''}
            onChange={event => {
              if (aggregate !== undefined && aggregateId !== undefined) {
                navigate(
                  path(
                    aggregate.name,
                    aggregate.version,
                    aggregateId,
                    event.target.value,
                  ),
                );
              }
            }}
          >
            <option value="">Select agent</option>
            {agents.map(candidate => (
              <option key={candidate.name}>{candidate.name}</option>
            ))}
          </select>
        </label>
      </div>
      {error !== undefined && (
        <div className="text-sm">
          <p role="alert">Failed to load aggregate IDs: {error.message}</p>
          <button
            type="button"
            className="underline"
            onClick={() => {
              void mutate();
            }}
          >
            Retry
          </button>
        </div>
      )}
      {sessionError !== null && <p role="alert">{sessionError}</p>}
      {aggregate !== undefined &&
        agents.length > 0 &&
        !loading &&
        error === undefined &&
        ids.length === 0 && <p>No registered aggregate IDs.</p>}
      {aggregate !== undefined && agents.length === 0 && (
        <p>No agents declared for this aggregate version.</p>
      )}
    </main>
  );
}
