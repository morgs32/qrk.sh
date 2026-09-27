import { act } from 'react';

import { Effect, Schema } from 'effect';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { useInitializeSession } from './useInitializeSession';

const identitySchema = Schema.Struct({ aggregateId: Schema.String });
const base = {
  identitySchema,
  systemName: 'test',
  definition: {
    kind: 'aggregate' as const,
    aggregateName: 'test',
    aggregateVersion: '1.0.0',
  },
  store: {
    subscribe: () => () => undefined,
    getState: () => ({ isInitialized: false }),
  },
};
let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  root = createRoot(container);
});
afterEach(async () => {
  await act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

it('does not retarget a direct session on rerender and disposes its owned initialization', async () => {
  const initialize = vi.fn(
    async (_props: { identity: typeof identitySchema.Type }) => undefined,
  );
  const dispose = vi.fn(async () => undefined);
  const session = { ...base, initialize, dispose };
  function App({ aggregateId }: { aggregateId: string }) {
    useInitializeSession({ session, identity: { aggregateId } });
    return null;
  }
  await act(() => root.render(<App aggregateId="acct_first" />));
  await act(() => root.render(<App aggregateId="acct_second" />));
  expect(initialize).toHaveBeenCalledTimes(1);
  expect(initialize).toHaveBeenCalledWith({
    identity: { aggregateId: 'acct_first' },
  });
  await act(() => root.render(null));
  expect(dispose).toHaveBeenCalledTimes(1);
});

it('invokes disposal of the previous session before initializing its replacement', async () => {
  const first = {
    ...base,
    initialize: vi.fn(async () => undefined),
    dispose: vi.fn(async () => undefined),
  };
  const second = {
    ...base,
    initialize: vi.fn(async () => undefined),
    dispose: vi.fn(async () => undefined),
  };
  function App({ session }: { session: typeof first }) {
    useInitializeSession({ session, identity: { aggregateId: 'acct_first' } });
    return null;
  }

  await act(() => root.render(<App session={first} />));
  expect(first.initialize).toHaveBeenCalledTimes(1);
  expect(first.dispose).not.toHaveBeenCalled();

  await act(() => root.render(<App session={second} />));
  expect(first.dispose).toHaveBeenCalledTimes(1);
  expect(second.initialize).toHaveBeenCalledTimes(1);
  expect(first.dispose).toHaveBeenCalledBefore(second.initialize);
  expect(second.dispose).not.toHaveBeenCalled();

  await act(() => root.render(null));
  expect(first.dispose).toHaveBeenCalledTimes(1);
  expect(second.dispose).toHaveBeenCalledTimes(1);
});

it('uses the latest credential provider without remounting a verified session', async () => {
  const credentialsSchema = Schema.Struct({ token: Schema.String });
  const initialize = vi.fn(
    async (_props: {
      getCredentials: () => Effect.Effect<typeof credentialsSchema.Type>;
    }) => undefined,
  );
  const session = {
    ...base,
    credentialsSchema,
    initialize,
    dispose: vi.fn(async () => undefined),
  };
  function App({ token }: { token: string }) {
    useInitializeSession({
      session,
      getCredentials: () => Effect.succeed({ token }),
    });
    return null;
  }
  await act(() => root.render(<App token="first" />));
  const admitted = initialize.mock.calls[0]?.[0];
  expect(admitted).toBeDefined();
  if (admitted === undefined) throw new Error('Session was not initialized');
  expect(await Effect.runPromise(admitted.getCredentials())).toEqual({
    token: 'first',
  });
  await act(() => root.render(<App token="second" />));
  expect(initialize).toHaveBeenCalledTimes(1);
  expect(await Effect.runPromise(admitted.getCredentials())).toEqual({
    token: 'second',
  });
});
