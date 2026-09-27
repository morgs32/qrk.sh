import { act, StrictMode } from 'react';

import { it } from '@effect/vitest';
import { makeMockServiceSession } from '@zerospin/browser/makeMockSession/makeMockServiceSession';
import { makeServiceSessionDefinition } from '@zerospin/core/serviceSession/make/makeServiceSessionDefinition';
import { Context, Effect, Layer, Schema } from 'effect';
import { createRoot } from 'react-dom/client';
import { expect } from 'vitest';

import { useInitializeMockSession } from './useInitializeMockSession';

class Instance extends Context.Service<Instance, { id: number }>()(
  'ReactSessionInstance',
) {}

it('reuses the session across StrictMode and remounts while replacing disposed runtimes', async () => {
  let acquired = 0;
  let released = 0;
  const definition = makeServiceSessionDefinition({
    serviceName: 'test',
    serviceVersion: '1.0.0',
    actorName: 'reader',
    actorVersion: '1.0.0',
    sessionName: 'reader',
    models: {},
    identitySchema: Schema.Struct({ user: Schema.String }),
  });
  const session = makeMockServiceSession({
    definition,
    identity: { user: 'test' },
    layer: Layer.effect(
      Instance,
      Effect.acquireRelease(
        Effect.sync(() => ({ id: ++acquired })),
        () =>
          Effect.sync(() => {
            released++;
          }),
      ),
    ),
  });
  function View() {
    const { isInitialized } = useInitializeMockSession({ session });
    return <span>{isInitialized ? 'ready' : 'loading'}</span>;
  }
  const container = document.createElement('div');
  document.body.append(container);
  const store = session.store;
  const firstRuntime = session.runtime;
  let root = createRoot(container);
  try {
    let ready = new Promise<void>(resolve =>
      session.onInitialized(() => resolve()),
    );
    await act(async () => {
      root.render(
        <StrictMode>
          <View />
        </StrictMode>,
      );
    });
    await act(() => ready);
    expect(container.textContent).toBe('ready');
    expect(session.store).toBe(store);
    expect(session.runtime).not.toBe(firstRuntime);
    const mountedRuntime = session.runtime;
    await act(async () => {
      root.unmount();
      await session.dispose();
    });
    expect(released).toBe(acquired);
    expect(() => mountedRuntime.runSync(Instance)).toThrow(
      'ManagedRuntime disposed',
    );
    ready = new Promise<void>(resolve =>
      session.onInitialized(() => resolve()),
    );
    root = createRoot(container);
    await act(async () => {
      root.render(<View />);
    });
    await act(() => ready);
    expect(container.textContent).toBe('ready');
    expect(session.store).toBe(store);
    expect(session.runtime).not.toBe(mountedRuntime);
    expect(acquired - released).toBe(1);
  } finally {
    await act(async () => {
      root.unmount();
      await session.dispose();
    });
    container.remove();
  }
  expect(released).toBe(acquired);
});
