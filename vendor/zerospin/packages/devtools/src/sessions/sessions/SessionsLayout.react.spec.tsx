import { act } from 'react';

import { makeAggregateSession } from '@zerospin/core/aggregateSession/make/makeAggregateSession';
import { makeServiceSession } from '@zerospin/core/serviceSession/make/makeServiceSession';
import { Schema } from 'effect';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { afterEach, expect, it } from 'vitest';

import { zerospinDevtoolsStore } from '../../zerospinDevtoolsStore';

import { SessionsLayout } from './SessionsLayout';

afterEach(() => {
  zerospinDevtoolsStore.setState({
    aggregateSessionsById: new Map(),
    serviceSessionsById: new Map(),
  });
});

it('shows actor identity independently of aggregate, service, and session names', async () => {
  const aggregate = makeAggregateSession({
    definition: {
      kind: 'aggregate',
      systemName: 'test',
      aggregateName: 'inventory',
      aggregateVersion: '1.0.0',
      actorName: 'inventoryWriter',
      actorVersion: '1.0.0',
      sessionName: 'editor',
      claimsSchema: Schema.Struct({ aggregateId: Schema.String }),
      models: {},
      contracts: {},
      modelNames: [],
    },
  });
  const service = makeServiceSession({
    definition: {
      kind: 'service',
      systemName: 'test',
      serviceName: 'catalog',
      serviceVersion: '1.0.0',
      actorName: 'catalogReader',
      actorVersion: '1.0.0',
      sessionName: 'viewer',
      claimsSchema: Schema.Struct({}),
      models: {},
      contracts: {},
      modelNames: [],
    },
  });
  aggregate.store.setState({ sessionId: 'sesn_aggregate' });
  service.store.setState({ sessionId: 'sesn_service' });
  zerospinDevtoolsStore.getState().addAggregateSession({ session: aggregate });
  zerospinDevtoolsStore.getState().addServiceSession({ session: service });
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/sessions/sesn_aggregate/commands']}>
          <SessionsLayout />
        </MemoryRouter>,
      );
    });
    expect(
      Array.from(container.querySelectorAll('th'), cell => cell.textContent),
    ).toEqual(['Kind', 'Actor name', 'Session name', 'Session ID', 'Claims']);
    const rows = container.querySelectorAll('tbody tr');
    expect(
      Array.from(rows[0].querySelectorAll('td'))
        .slice(0, 3)
        .map(cell => cell.textContent),
    ).toEqual(['aggregate', 'inventoryWriter', 'editor']);
    expect(
      Array.from(rows[1].querySelectorAll('td'))
        .slice(0, 3)
        .map(cell => cell.textContent),
    ).toEqual(['service', 'catalogReader', 'viewer']);
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});
