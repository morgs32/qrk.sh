import { useEffect, useState } from 'react';

import { makeAgentSession } from '@zerospin/browser/makeAgentSession';
import type { IAgentSession } from '@zerospin/core/agent/types';
import { SystemSpecSchema } from '@zerospin/core/system/SystemSpecSchema';
import { Schema } from 'effect';
import { Link, useNavigate, useParams } from 'react-router';

import { AgentPreview } from './AgentPreview.js';

const system = Schema.decodeUnknownSync(
  Schema.fromJsonString(SystemSpecSchema),
)(import.meta.env.ZEROSPIN_SYSTEM_SPEC);
const bootstrapSchema = Schema.Struct({
  snapshot: Schema.Unknown,
  webSocketUrl: Schema.String,
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
  const [ids, setIds] = useState<readonly string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<IAgentSession | null>(null);
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

  useEffect(() => {
    const controller = new AbortController();
    setIds([]);
    setError(null);
    if (aggregateName === undefined || aggregateVersion === undefined) return;
    setLoading(true);
    const params = new URLSearchParams({ aggregateName, aggregateVersion });
    void fetch(`/api/agents/ids?${params}`, { signal: controller.signal })
      .then(readJson)
      .then(data => {
        if (!controller.signal.aborted) {
          setIds(Schema.decodeUnknownSync(Schema.Array(Schema.String))(data));
        }
      })
      .catch(cause => {
        if (!controller.signal.aborted) {
          setError(cause instanceof Error ? cause.message : String(cause));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [aggregateName, aggregateVersion]);

  useEffect(() => {
    setSession(null);
    if (agent === undefined || aggregateId === undefined) return;
    const next = makeAgentSession({
      agent,
      aggregateId,
      bootstrap: async signal => {
        const params = new URLSearchParams({
          agentName: agent.name,
          aggregateId,
        });
        const data = await readJson(
          await fetch(`/api/agents/open?${params}`, {
            signal,
            cache: 'no-store',
          }),
        );
        return Schema.decodeUnknownSync(bootstrapSchema)(data);
      },
    });
    setSession(next);
    void next.initialize().catch(() => undefined);
    return () => {
      void next.dispose();
    };
  }, [agent, aggregateId]);

  return (
    <main className="space-y-6 p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Agent query preview</h1>
        <Link to="/" className="underline">
          Studio home
        </Link>
      </header>
      <p className="text-sm text-muted-foreground">
        A read-only session runs while this view is open.
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
            disabled={aggregate === undefined || loading}
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
      {error !== null && <p role="alert">{error}</p>}
      {aggregate !== undefined &&
        !loading &&
        error === null &&
        ids.length === 0 && <p>No registered aggregate IDs.</p>}
      {aggregate !== undefined && agents.length === 0 && (
        <p>No agents declared for this aggregate version.</p>
      )}
      {session !== null && (
        <AgentPreview
          key={`${session.agent.name}:${session.aggregateId}`}
          session={session}
        />
      )}
    </main>
  );
}
