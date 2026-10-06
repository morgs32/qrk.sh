import { useState, useSyncExternalStore } from 'react';

import { Link, MemoryRouter, useLocation } from 'react-router';
import { SWRConfig } from 'swr';

import { StudioHome } from '../src/StudioHome.js';
import { useAgentAggregateIds } from '../src/useAgentAggregateIds.js';

import {
  aggregateName,
  aggregateVersion,
  systemSpec,
  type HomepageFixture,
  type IHomepageOptions,
} from './homepageFixture.js';

const buttonClass = 'rounded border px-3 py-2 text-sm disabled:opacity-50';

function QueryProbe({ initialSelection }: { initialSelection: string }) {
  const [selection, setSelection] = useState(initialSelection);
  const { data, error, isLoading, mutate } = useAgentAggregateIds({
    aggregateName: selection === 'secondary' ? 'secondary' : aggregateName,
    aggregateVersion: selection === 'version' ? '2.0.0' : aggregateVersion,
    enabled: selection !== 'off',
  });
  return (
    <section className="min-w-0 space-y-2 text-sm" aria-label="SWR query probe">
      <label className="grid gap-1">
        Probe aggregate
        <select
          className="max-w-full rounded border p-2"
          value={selection}
          onChange={event => setSelection(event.currentTarget.value)}
        >
          <option value="off">Disabled</option>
          <option value="primary">Same name/version as homepage</option>
          <option value="secondary">Different aggregate name</option>
          <option value="version">Different aggregate version</option>
        </select>
      </label>
      <output className="block wrap-anywhere" aria-label="Probe aggregate IDs">
        {selection === 'off'
          ? 'Disabled'
          : isLoading
            ? 'Loading probe…'
            : (data ?? []).join(', ')}
      </output>
      {error !== undefined && <p role="alert">{error.message}</p>}
      <button
        className={buttonClass}
        disabled={selection === 'off'}
        type="button"
        onClick={() => void mutate()}
      >
        Refresh probe
      </button>
    </section>
  );
}

function Homepage({ noAgents }: { noAgents: boolean }) {
  const location = useLocation();
  if (location.pathname !== '/') {
    return (
      <main className="min-w-0 space-y-3 p-6">
        <h1 className="text-xl font-semibold">Selected route</h1>
        <output
          aria-label="Selected route"
          className="block min-w-0 rounded border bg-muted p-3 font-mono text-sm wrap-anywhere"
        >
          {location.pathname}
        </output>
        <Link to="/" className="underline">
          Back to Studio home
        </Link>
      </main>
    );
  }
  return (
    <StudioHome
      systemSpec={noAgents ? { ...systemSpec, agents: {} } : systemSpec}
      repoTypes={[
        'SystemRepo',
        'AggregateVersionRepo',
        'AggregateActorVersionRepo',
      ]}
    />
  );
}

function ScenarioControls({
  fixture,
  options,
}: {
  fixture: HomepageFixture;
  options: IHomepageOptions;
}) {
  const { mutate } = useAgentAggregateIds({
    aggregateName,
    aggregateVersion,
    enabled: options.refresh === true,
  });
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-3">
      {options.scenario === 'loading' && (
        <>
          {fixture.pendingResponses.size === 0 && (
            <p className="text-sm">No responses awaiting release.</p>
          )}
          {[...fixture.pendingResponses].map(([number, release]) => (
            <button
              key={number}
              className={buttonClass}
              type="button"
              onClick={release}
            >
              Release request {number}
            </button>
          ))}
        </>
      )}
      {(options.refresh || options.events) && (
        <>
          <button
            className={buttonClass}
            type="button"
            onClick={() => fixture.failNext()}
          >
            Fail next query
          </button>
          {fixture.failNextQuery && (
            <p className="text-sm">Next query will fail.</p>
          )}
        </>
      )}
      {options.refresh && (
        <button
          className={buttonClass}
          type="button"
          onClick={() => void mutate()}
        >
          Refresh homepage IDs
        </button>
      )}
      {options.events && (
        <>
          <button
            className={buttonClass}
            type="button"
            onClick={() => fixture.addRegisteredId()}
          >
            Add registered ID
          </button>
          <button
            className={buttonClass}
            type="button"
            onClick={() => {
              window.dispatchEvent(new Event('blur'));
              window.dispatchEvent(new Event('focus'));
            }}
          >
            Simulate focus
          </button>
          <button
            className={buttonClass}
            type="button"
            onClick={() => {
              window.dispatchEvent(new Event('offline'));
              window.dispatchEvent(new Event('online'));
            }}
          >
            Simulate reconnect
          </button>
        </>
      )}
    </div>
  );
}

export function HomepagePreview({
  fixture,
  options,
}: {
  fixture: HomepageFixture;
  options: IHomepageOptions;
}) {
  useSyncExternalStore(fixture.subscribe, fixture.getSnapshot);
  return (
    <div className="min-w-0 space-y-4 p-4">
      <p className="max-w-3xl text-sm text-muted-foreground">
        {options.description}
      </p>
      <SWRConfig value={{ provider: () => fixture.cache }}>
        {(options.scenario === 'loading' ||
          options.refresh ||
          options.events) && (
          <ScenarioControls fixture={fixture} options={options} />
        )}
        {options.probe !== undefined && (
          <QueryProbe initialSelection={options.probe} />
        )}
        <section className="min-w-0 space-y-2 text-sm" aria-label="ID requests">
          <h2>ID requests: {fixture.requests.length}</h2>
          <ol className="list-decimal space-y-1 pl-6 font-mono wrap-anywhere">
            {fixture.requests.map((request, index) => (
              <li key={index}>{request}</li>
            ))}
          </ol>
        </section>
        <MemoryRouter initialEntries={['/']}>
          <section
            aria-label="Studio homepage preview"
            className="min-w-0 max-w-full"
          >
            <Homepage noAgents={options.scenario === 'no-agents'} />
          </section>
        </MemoryRouter>
      </SWRConfig>
    </div>
  );
}
