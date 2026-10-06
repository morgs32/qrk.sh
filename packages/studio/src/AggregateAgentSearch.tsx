import { useMemo, type RefObject } from 'react';

import { Combobox } from '@zerospin/fragment-ui/Combobox';
import { Outline, OutlineItem } from '@zerospin/fragment-ui/Outline';
import { useNavigate } from 'react-router';

import { useAgentAggregateIds } from './useAgentAggregateIds.js';

const emptyIds: readonly string[] = [];

export function AggregateAgentSearch({
  aggregateName,
  aggregateVersion,
  agentNames,
  portalContainer,
}: {
  aggregateName: string;
  aggregateVersion: string;
  agentNames: readonly string[];
  portalContainer?: RefObject<HTMLDivElement | null>;
}) {
  const navigate = useNavigate();
  const hasAgents = agentNames.length > 0;
  const {
    data,
    error,
    isLoading: loading,
    mutate,
  } = useAgentAggregateIds({
    aggregateName,
    aggregateVersion,
    enabled: hasAgents,
  });
  const ids = data ?? emptyIds;
  const options = useMemo(
    () => ids.map(id => ({ value: id, label: id })),
    [ids],
  );

  if (!hasAgents) {
    return (
      <p className="mt-1 text-sm text-muted-foreground">No agents declared.</p>
    );
  }

  return (
    <>
      <Outline type="1" className="min-w-0 space-y-3">
        {agentNames.map(agentName => (
          <OutlineItem
            key={agentName}
            className="min-w-0"
            label={<span className="break-all">{agentName}</span>}
          >
            <div className="mt-1 w-full min-w-0 max-w-sm">
              <Combobox
                label={`Search aggregate IDs for ${agentName}`}
                options={options}
                placeholder="Search aggregate IDs…"
                emptyLabel="No matching aggregate IDs."
                portalContainer={portalContainer}
                disabled={loading || ids.length === 0}
                onInputValueChange={(_query, details) => {
                  // Keep each filter when its popup closes or the theme menu takes focus.
                  if (details.reason === 'input-clear') details.cancel();
                }}
                onValueChange={id => {
                  if (id !== null) {
                    navigate(
                      `/agents/${[
                        aggregateName,
                        aggregateVersion,
                        id,
                        agentName,
                      ]
                        .map(encodeURIComponent)
                        .join('/')}`,
                    );
                  }
                }}
              />
            </div>
          </OutlineItem>
        ))}
      </Outline>
      {loading && (
        <output className="mt-1 block text-sm text-muted-foreground">
          Loading aggregate IDs…
        </output>
      )}
      {error !== undefined && (
        <div className="mt-1 text-sm">
          <p role="alert" className="break-words text-destructive">
            Failed to load aggregate IDs: {error.message}
          </p>
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
      {!loading && error === undefined && ids.length === 0 && (
        <output className="mt-1 block text-sm text-muted-foreground">
          No registered aggregate IDs.
        </output>
      )}
    </>
  );
}
