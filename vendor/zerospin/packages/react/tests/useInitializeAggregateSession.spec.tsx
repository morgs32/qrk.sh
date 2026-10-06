import { Component, StrictMode, type ReactNode } from 'react';

import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import type {
  IBrowserSessionFailureCallbacks,
  ISessionCommandFailure,
} from '@zerospin/browser/failureTypes';
import type { IAggregateStageFailure } from '@zerospin/core/aggregateSession/types';
import type { ISessionInitialization } from '@zerospin/core/identity/types';
import type { IServiceStageFailure } from '@zerospin/core/serviceSession/types';
import { recognizeZerospinError } from '@zerospin/error';
import {
  useInitializeAggregateSession,
  useInitializeServiceSession,
} from '@zerospin/react';
import { Effect, Exit, Schema } from 'effect';
import { assert, type Equals } from 'tsafe';
import { afterEach, describe, expect, it, vi } from 'vitest';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
afterEach(cleanup);

const claimsSchema = Schema.Struct({});
const failure = recognizeZerospinError(Schema.Never, {
  _tag: 'ZerospinError',
  code: 'fixture-rejected',
  message: 'Rejected',
  status: 400,
  extra: null,
});
const stageEvent: IAggregateStageFailure = { contractName: 'add', failure };
const serviceStageEvent: IServiceStageFailure = {
  contractName: 'add',
  failure,
};
const commandEvent: ISessionCommandFailure = {
  commandId: 'cmd_one',
  commandName: 'add',
  failure,
};

function makeChannel<EVENT>(name: string, order: string[]) {
  const listeners = new Set<(event: EVENT) => void>();
  const subscribe = vi.fn((handler: (event: EVENT) => void) => {
    order.push(`subscribe:${name}`);
    listeners.add(handler);
    return vi.fn(() => {
      order.push(`unsubscribe:${name}`);
      listeners.delete(handler);
    });
  });
  return {
    listeners,
    subscribe,
    emit(event: EVENT) {
      for (const listener of [...listeners]) listener(event);
    },
  };
}

function makeLifecycle(order: string[]) {
  const state = { isInitialized: false };
  const listeners = new Set<() => void>();
  let owned = false;
  return {
    claimsSchema,
    systemName: 'fixture',
    store: {
      getState: () => state,
      subscribe(listener: () => void) {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
    },
    initialize: vi.fn(
      (_props: ISessionInitialization<typeof claimsSchema, undefined>) => {
        order.push('initialize');
        if (owned) throw new Error('Already initialized');
        owned = true;
        state.isInitialized = true;
        for (const listener of listeners) listener();
        return Promise.resolve();
      },
    ),
    dispose: vi.fn(() => {
      order.push('dispose');
      owned = false;
      state.isInitialized = false;
      for (const listener of listeners) listener();
      return Promise.resolve();
    }),
  };
}

function makeAggregateFixture() {
  const order: string[] = [];
  const channels = {
    stage: makeChannel<IAggregateStageFailure>('stage', order),
    admission: makeChannel<ISessionCommandFailure>('admission', order),
    execution: makeChannel<ISessionCommandFailure>('execution', order),
    connection: makeChannel<{ message: string }>('connection', order),
    persistence: makeChannel<{ message: string }>('persistence', order),
    authentication: makeChannel<{ message: string }>('authentication', order),
    protocol: makeChannel<{ message: string }>('protocol', order),
  };
  const session = {
    ...makeLifecycle(order),
    definition: {
      kind: 'aggregate' as const,
      aggregateName: 'counter',
      aggregateVersion: '1.0.0',
    },
    onStageFailure: channels.stage.subscribe,
    onAdmissionFailure: channels.admission.subscribe,
    onExecutionFailure: channels.execution.subscribe,
    onSharedWorkerConnectionFailure: channels.connection.subscribe,
    onSharedWorkerPersistenceFailure: channels.persistence.subscribe,
    onAuthenticationFailure: channels.authentication.subscribe,
    onServerProtocolFailure: channels.protocol.subscribe,
  };
  return { session, channels, order };
}

function makeServiceFixture() {
  const order: string[] = [];
  const channels = {
    stage: makeChannel<IServiceStageFailure>('stage', order),
    admission: makeChannel<ISessionCommandFailure>('admission', order),
    execution: makeChannel<ISessionCommandFailure>('execution', order),
    connection: makeChannel<{ message: string }>('connection', order),
    persistence: makeChannel<{ message: string }>('persistence', order),
    authentication: makeChannel<{ message: string }>('authentication', order),
    protocol: makeChannel<{ message: string }>('protocol', order),
  };
  return {
    order,
    channels,
    session: {
      ...makeLifecycle(order),
      definition: {
        kind: 'service' as const,
        serviceName: 'counter',
        serviceVersion: '1.0.0',
      },
      onStageFailure: channels.stage.subscribe,
      onAdmissionFailure: channels.admission.subscribe,
      onExecutionFailure: channels.execution.subscribe,
      onSharedWorkerConnectionFailure: channels.connection.subscribe,
      onSharedWorkerPersistenceFailure: channels.persistence.subscribe,
      onAuthenticationFailure: channels.authentication.subscribe,
      onServerProtocolFailure: channels.protocol.subscribe,
    },
  };
}

function makeCredentialServiceFixture() {
  const fixture = makeServiceFixture();
  return {
    ...fixture,
    session: {
      ...fixture.session,
      credentialsSchema: Schema.String,
      initialize: vi.fn(
        (
          _props: ISessionInitialization<
            typeof claimsSchema,
            typeof Schema.String
          >,
        ) => fixture.session.initialize({ claims: {} }),
      ),
    },
  };
}

function AggregateHarness(props: {
  session: ReturnType<typeof makeAggregateFixture>['session'];
  callbacks?: IBrowserSessionFailureCallbacks & {
    onStageFailure?: (event: IAggregateStageFailure) => void;
  };
}) {
  const { isInitialized } = useInitializeAggregateSession({
    session: props.session,
    claims: {},
    ...props.callbacks,
  });
  return <span>{isInitialized ? 'Ready' : 'Starting'}</span>;
}

function ServiceHarness(props: {
  session: ReturnType<typeof makeServiceFixture>['session'];
  callbacks?: IBrowserSessionFailureCallbacks & {
    onStageFailure?: (event: IServiceStageFailure) => void;
  };
}) {
  const { isInitialized } = useInitializeServiceSession({
    session: props.session,
    claims: {},
    ...props.callbacks,
  });
  return <span>{isInitialized ? 'Service ready' : 'Starting'}</span>;
}

function CredentialServiceHarness(props: {
  session: ReturnType<typeof makeCredentialServiceFixture>['session'];
  getCredentials: () => Effect.Effect<string>;
}) {
  const { isInitialized } = useInitializeServiceSession(props);
  return <span>{isInitialized ? 'Credential service ready' : 'Starting'}</span>;
}

class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    return this.state.failed ? (
      <span>Rejected mount</span>
    ) : (
      this.props.children
    );
  }
}

describe('useInitializeAggregateSession failure callbacks', () => {
  it('uses the latest callbacks after rerender, supports adding/removing callbacks, and unsubscribes before disposal', () => {
    const fixture = makeAggregateFixture();
    const first = vi.fn();
    const latest = vi.fn();
    const execution = vi.fn();
    const mounted = render(
      <AggregateHarness
        session={fixture.session}
        callbacks={{ onStageFailure: first }}
      />,
    );
    expect(screen.getByText('Ready')).toBeTruthy();
    act(() => fixture.channels.stage.emit(stageEvent));
    expect(first).toHaveBeenCalledWith(stageEvent);
    mounted.rerender(
      <AggregateHarness
        session={fixture.session}
        callbacks={{ onStageFailure: latest, onExecutionFailure: execution }}
      />,
    );
    act(() => {
      fixture.channels.stage.emit(stageEvent);
      fixture.channels.execution.emit(commandEvent);
    });
    expect(first).toHaveBeenCalledTimes(1);
    expect(latest).toHaveBeenCalledWith(stageEvent);
    expect(execution).toHaveBeenCalledWith(commandEvent);
    mounted.rerender(<AggregateHarness session={fixture.session} />);
    act(() => {
      fixture.channels.stage.emit(stageEvent);
      fixture.channels.execution.emit(commandEvent);
    });
    expect(latest).toHaveBeenCalledTimes(1);
    expect(execution).toHaveBeenCalledTimes(1);
    expect(fixture.session.initialize).toHaveBeenCalledTimes(1);
    for (const channel of Object.values(fixture.channels)) {
      expect(channel.subscribe).toHaveBeenCalledTimes(1);
    }
    mounted.unmount();
    expect(fixture.session.dispose).toHaveBeenCalledTimes(1);
    expect(fixture.order.at(-1)).toBe('dispose');
    expect(
      fixture.order.filter(value => value.startsWith('unsubscribe:')),
    ).toHaveLength(7);
    for (const channel of Object.values(fixture.channels)) {
      expect(channel.listeners.size).toBe(0);
    }
  });

  it('registers callbacks while owned initialization is pending and drops callbacks after unmount', async () => {
    const { session, channels } = makeAggregateFixture();
    const started = Promise.withResolvers<void>();
    session.initialize.mockImplementationOnce(() => started.promise);
    const callback = vi.fn();
    const mounted = render(
      <AggregateHarness
        session={session}
        callbacks={{ onAuthenticationFailure: callback }}
      />,
    );
    const captured = [...channels.authentication.listeners][0];
    act(() =>
      channels.authentication.emit({ message: 'Credentials rejected' }),
    );
    expect(callback).toHaveBeenCalledWith({ message: 'Credentials rejected' });
    mounted.unmount();
    expect(session.dispose).toHaveBeenCalledTimes(1);
    await act(async () => {
      captured?.({ message: 'Late failure' });
      started.resolve();
      await started.promise;
    });
    expect(callback).toHaveBeenCalledTimes(1);
    for (const channel of Object.values(channels)) {
      expect(channel.listeners.size).toBe(0);
    }
  });

  it('delivers each specific failure callback', () => {
    const { session, channels } = makeAggregateFixture();
    const callbacks = {
      onStageFailure: vi.fn(),
      onAdmissionFailure: vi.fn(),
      onExecutionFailure: vi.fn(),
      onSharedWorkerConnectionFailure: vi.fn(),
      onSharedWorkerPersistenceFailure: vi.fn(),
      onAuthenticationFailure: vi.fn(),
      onServerProtocolFailure: vi.fn(),
    };
    render(<AggregateHarness session={session} callbacks={callbacks} />);
    const blocked = { message: 'Blocked' };
    act(() => {
      channels.stage.emit(stageEvent);
      channels.admission.emit(commandEvent);
      channels.execution.emit(commandEvent);
      channels.connection.emit(blocked);
      channels.persistence.emit(blocked);
      channels.authentication.emit(blocked);
      channels.protocol.emit(blocked);
    });
    expect(callbacks.onStageFailure).toHaveBeenCalledWith(stageEvent);
    expect(callbacks.onAdmissionFailure).toHaveBeenCalledWith(commandEvent);
    expect(callbacks.onExecutionFailure).toHaveBeenCalledWith(commandEvent);
    for (const callback of [
      callbacks.onSharedWorkerConnectionFailure,
      callbacks.onSharedWorkerPersistenceFailure,
      callbacks.onAuthenticationFailure,
      callbacks.onServerProtocolFailure,
    ]) {
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(blocked);
    }
  });

  it('rejects stale delivery after replacing a session and cleans up both owners', () => {
    const first = makeAggregateFixture();
    const next = makeAggregateFixture();
    const oldCallback = vi.fn();
    const nextCallback = vi.fn();
    const mounted = render(
      <AggregateHarness
        session={first.session}
        callbacks={{ onAdmissionFailure: oldCallback }}
      />,
    );
    const captured = [...first.channels.admission.listeners][0];
    expect(captured).toBeDefined();
    mounted.rerender(
      <AggregateHarness
        session={next.session}
        callbacks={{ onAdmissionFailure: nextCallback }}
      />,
    );
    act(() => {
      captured?.(commandEvent);
      next.channels.admission.emit(commandEvent);
    });
    expect(oldCallback).not.toHaveBeenCalled();
    expect(nextCallback).toHaveBeenCalledTimes(1);
    expect(first.session.dispose).toHaveBeenCalledTimes(1);
    for (const channel of Object.values(first.channels)) {
      expect(channel.listeners.size).toBe(0);
    }
    mounted.unmount();
    expect(next.session.dispose).toHaveBeenCalledTimes(1);
  });

  it('ignores an old initialization rejection after session replacement', async () => {
    const first = makeAggregateFixture();
    const next = makeAggregateFixture();
    const started = Promise.withResolvers<void>();
    first.session.initialize.mockImplementationOnce(() => started.promise);
    const mounted = render(
      <Boundary>
        <AggregateHarness session={first.session} />
      </Boundary>,
    );
    mounted.rerender(
      <Boundary>
        <AggregateHarness session={next.session} />
      </Boundary>,
    );
    await act(async () => {
      started.reject(new Error('Old startup failed'));
      await started.promise.catch(() => {});
    });
    expect(screen.getByText('Ready')).toBeTruthy();
    expect(screen.queryByText('Rejected mount')).toBeNull();
    expect(first.session.dispose).toHaveBeenCalledTimes(1);
    expect(next.session.dispose).not.toHaveBeenCalled();
  });

  it('reports an owned asynchronous initialization failure and releases its listeners', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { session, channels, order } = makeAggregateFixture();
    const started = Promise.withResolvers<void>();
    session.initialize.mockImplementationOnce(() => started.promise);
    render(
      <Boundary>
        <AggregateHarness session={session} />
      </Boundary>,
    );
    await act(async () => {
      started.reject(new Error('Startup failed'));
      await started.promise.catch(() => {});
    });
    expect(screen.getByText('Rejected mount')).toBeTruthy();
    expect(session.dispose).toHaveBeenCalledTimes(1);
    expect(order.at(-1)).toBe('dispose');
    for (const channel of Object.values(channels)) {
      expect(channel.listeners.size).toBe(0);
    }
  });

  it('leaves one owner and one listener per callback after StrictMode replay', () => {
    const { session, channels } = makeAggregateFixture();
    const callback = vi.fn();
    const mounted = render(
      <StrictMode>
        <AggregateHarness
          session={session}
          callbacks={{ onExecutionFailure: callback }}
        />
      </StrictMode>,
    );
    expect(session.initialize).toHaveBeenCalledTimes(2);
    expect(session.dispose).toHaveBeenCalledTimes(1);
    for (const channel of Object.values(channels)) {
      expect(channel.listeners.size).toBe(1);
    }
    act(() => channels.execution.emit(commandEvent));
    expect(callback).toHaveBeenCalledTimes(1);
    mounted.unmount();
    expect(session.dispose).toHaveBeenCalledTimes(2);
    for (const channel of Object.values(channels)) {
      expect(channel.listeners.size).toBe(0);
    }
  });

  it('a rejected competing mount acquires no listeners and never disposes the owner', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { session, channels } = makeAggregateFixture();
    const ownerCallback = vi.fn();
    const competitorCallback = vi.fn();
    const owner = render(
      <AggregateHarness
        session={session}
        callbacks={{ onStageFailure: ownerCallback }}
      />,
    );
    const competitor = render(
      <Boundary>
        <AggregateHarness
          session={session}
          callbacks={{ onStageFailure: competitorCallback }}
        />
      </Boundary>,
    );
    await waitFor(() =>
      expect(screen.getByText('Rejected mount')).toBeTruthy(),
    );
    expect(session.dispose).not.toHaveBeenCalled();
    for (const channel of Object.values(channels)) {
      expect(channel.listeners.size).toBe(1);
      expect(channel.subscribe).toHaveBeenCalledTimes(1);
    }
    act(() => channels.stage.emit(stageEvent));
    expect(ownerCallback).toHaveBeenCalledTimes(1);
    expect(competitorCallback).not.toHaveBeenCalled();
    competitor.unmount();
    expect(session.dispose).not.toHaveBeenCalled();
    owner.unmount();
    expect(session.dispose).toHaveBeenCalledTimes(1);
  });
});

describe('useInitializeServiceSession lifecycle', () => {
  it('initializes service sessions with optional callbacks and unsubscribes before disposal', () => {
    const { session, channels, order } = makeServiceFixture();
    const mounted = render(<ServiceHarness session={session} />);
    expect(screen.getByText('Service ready')).toBeTruthy();
    expect(session.initialize).toHaveBeenCalledWith({ claims: {} });
    mounted.unmount();
    expect(session.dispose).toHaveBeenCalledTimes(1);
    expect(order.at(-1)).toBe('dispose');
    expect(
      order.filter(value => value.startsWith('unsubscribe:')),
    ).toHaveLength(7);
    for (const channel of Object.values(channels)) {
      expect(channel.listeners.size).toBe(0);
    }
  });

  it('uses the latest service callbacks without reinitializing and permits adding or removing them', () => {
    const { session, channels } = makeServiceFixture();
    const original = vi.fn();
    const current = vi.fn();
    const admission = vi.fn();
    const mounted = render(
      <ServiceHarness
        session={session}
        callbacks={{ onStageFailure: original }}
      />,
    );
    act(() => channels.stage.emit(serviceStageEvent));
    expect(original.mock.calls[0]?.[0]).toBe(serviceStageEvent);
    mounted.rerender(
      <ServiceHarness
        session={session}
        callbacks={{ onStageFailure: current, onAdmissionFailure: admission }}
      />,
    );
    act(() => {
      channels.stage.emit(serviceStageEvent);
      channels.admission.emit(commandEvent);
    });
    expect(original).toHaveBeenCalledTimes(1);
    expect(current.mock.calls[0]?.[0]).toBe(serviceStageEvent);
    expect(admission.mock.calls[0]?.[0]).toBe(commandEvent);
    mounted.rerender(<ServiceHarness session={session} />);
    act(() => {
      channels.stage.emit(serviceStageEvent);
      channels.admission.emit(commandEvent);
    });
    expect(current).toHaveBeenCalledTimes(1);
    expect(admission).toHaveBeenCalledTimes(1);
    expect(session.initialize).toHaveBeenCalledTimes(1);
    for (const channel of Object.values(channels)) {
      expect(channel.subscribe).toHaveBeenCalledTimes(1);
    }
  });

  it('delivers every service failure callback', () => {
    const { session, channels } = makeServiceFixture();
    const callbacks = {
      onStageFailure: vi.fn(),
      onAdmissionFailure: vi.fn(),
      onExecutionFailure: vi.fn(),
      onSharedWorkerConnectionFailure: vi.fn(),
      onSharedWorkerPersistenceFailure: vi.fn(),
      onAuthenticationFailure: vi.fn(),
      onServerProtocolFailure: vi.fn(),
    };
    render(<ServiceHarness session={session} callbacks={callbacks} />);
    const blocked = { message: 'Blocked' };
    act(() => {
      channels.stage.emit(serviceStageEvent);
      channels.admission.emit(commandEvent);
      channels.execution.emit(commandEvent);
      channels.connection.emit(blocked);
      channels.persistence.emit(blocked);
      channels.authentication.emit(blocked);
      channels.protocol.emit(blocked);
    });
    expect(callbacks.onStageFailure).toHaveBeenCalledWith(serviceStageEvent);
    expect(callbacks.onAdmissionFailure).toHaveBeenCalledWith(commandEvent);
    expect(callbacks.onExecutionFailure).toHaveBeenCalledWith(commandEvent);
    for (const callback of [
      callbacks.onSharedWorkerConnectionFailure,
      callbacks.onSharedWorkerPersistenceFailure,
      callbacks.onAuthenticationFailure,
      callbacks.onServerProtocolFailure,
    ]) {
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(blocked);
    }
  });

  it('registers callbacks during accepted pending initialization and suppresses captured listeners after unmount', async () => {
    const { session, channels } = makeServiceFixture();
    const started = Promise.withResolvers<void>();
    session.initialize.mockImplementationOnce(() => started.promise);
    const callback = vi.fn();
    const mounted = render(
      <ServiceHarness
        session={session}
        callbacks={{ onAuthenticationFailure: callback }}
      />,
    );
    const captured = [...channels.authentication.listeners][0];
    expect(captured).toBeDefined();
    act(() =>
      channels.authentication.emit({ message: 'Credentials rejected' }),
    );
    expect(callback).toHaveBeenCalledWith({ message: 'Credentials rejected' });
    mounted.unmount();
    await act(async () => {
      captured?.({ message: 'Late failure' });
      started.resolve();
      await started.promise;
    });
    expect(callback).toHaveBeenCalledTimes(1);
    expect(session.dispose).toHaveBeenCalledTimes(1);
    for (const channel of Object.values(channels)) {
      expect(channel.listeners.size).toBe(0);
    }
  });

  it('disposes the old service before replacement and rejects its captured callbacks', () => {
    const first = makeServiceFixture();
    const next = makeServiceFixture();
    const previous = vi.fn();
    const replacement = vi.fn();
    next.session.initialize.mockImplementationOnce(() => {
      expect(first.session.dispose).toHaveBeenCalledTimes(1);
      for (const channel of Object.values(first.channels)) {
        expect(channel.listeners.size).toBe(0);
      }
      return Promise.resolve();
    });
    const mounted = render(
      <ServiceHarness
        session={first.session}
        callbacks={{ onExecutionFailure: previous }}
      />,
    );
    const captured = [...first.channels.execution.listeners][0];
    expect(captured).toBeDefined();
    mounted.rerender(
      <ServiceHarness
        session={next.session}
        callbacks={{ onExecutionFailure: replacement }}
      />,
    );
    act(() => {
      captured?.(commandEvent);
      next.channels.execution.emit(commandEvent);
    });
    expect(previous).not.toHaveBeenCalled();
    expect(replacement).toHaveBeenCalledTimes(1);
    expect(next.session.initialize).toHaveBeenCalledWith({ claims: {} });
    expect(next.session.dispose).not.toHaveBeenCalled();
    mounted.unmount();
    expect(next.session.dispose).toHaveBeenCalledTimes(1);
  });

  it('leaves one service owner and one listener per callback after StrictMode replay', () => {
    const { session, channels } = makeServiceFixture();
    const callback = vi.fn();
    const mounted = render(
      <StrictMode>
        <ServiceHarness
          session={session}
          callbacks={{ onAdmissionFailure: callback }}
        />
      </StrictMode>,
    );
    expect(screen.getByText('Service ready')).toBeTruthy();
    expect(session.initialize).toHaveBeenCalledTimes(2);
    expect(session.dispose).toHaveBeenCalledTimes(1);
    for (const channel of Object.values(channels)) {
      expect(channel.listeners.size).toBe(1);
    }
    act(() => channels.admission.emit(commandEvent));
    expect(callback).toHaveBeenCalledTimes(1);
    mounted.unmount();
    expect(session.dispose).toHaveBeenCalledTimes(2);
    for (const channel of Object.values(channels)) {
      expect(channel.listeners.size).toBe(0);
    }
  });

  it('a rejected competing service mount acquires no listeners and never disposes the owner', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { session, channels } = makeServiceFixture();
    const ownerCallback = vi.fn();
    const competitorCallback = vi.fn();
    const owner = render(
      <ServiceHarness
        session={session}
        callbacks={{ onStageFailure: ownerCallback }}
      />,
    );
    const competitor = render(
      <Boundary>
        <ServiceHarness
          session={session}
          callbacks={{ onStageFailure: competitorCallback }}
        />
      </Boundary>,
    );
    await waitFor(() =>
      expect(screen.getByText('Rejected mount')).toBeTruthy(),
    );
    expect(session.dispose).not.toHaveBeenCalled();
    for (const channel of Object.values(channels)) {
      expect(channel.subscribe).toHaveBeenCalledTimes(1);
      expect(channel.listeners.size).toBe(1);
    }
    act(() => channels.stage.emit(serviceStageEvent));
    expect(ownerCallback).toHaveBeenCalledTimes(1);
    expect(competitorCallback).not.toHaveBeenCalled();
    competitor.unmount();
    expect(session.dispose).not.toHaveBeenCalled();
    owner.unmount();
    expect(session.dispose).toHaveBeenCalledTimes(1);
  });

  it('reads the latest credentials without reinitializing and cancels stale providers', async () => {
    const first = makeCredentialServiceFixture();
    const next = makeCredentialServiceFixture();
    const originalCredentials = vi.fn(() => Effect.succeed('original'));
    const currentCredentials = vi.fn(() => Effect.succeed('current'));
    const replacementCredentials = vi.fn(() => Effect.succeed('replacement'));
    const mounted = render(
      <CredentialServiceHarness
        session={first.session}
        getCredentials={originalCredentials}
      />,
    );
    const initialization = first.session.initialize.mock.calls[0]?.[0];
    if (initialization === undefined) {
      throw new Error('Service was not initialized');
    }
    mounted.rerender(
      <CredentialServiceHarness
        session={first.session}
        getCredentials={currentCredentials}
      />,
    );
    expect(await Effect.runPromise(initialization.getCredentials())).toBe(
      'current',
    );
    expect(first.session.initialize).toHaveBeenCalledTimes(1);
    expect(originalCredentials).not.toHaveBeenCalled();
    expect(currentCredentials).toHaveBeenCalledTimes(1);
    mounted.rerender(
      <CredentialServiceHarness
        session={next.session}
        getCredentials={replacementCredentials}
      />,
    );
    expect(
      Exit.isFailure(
        await Effect.runPromiseExit(initialization.getCredentials()),
      ),
    ).toBe(true);
    expect(currentCredentials).toHaveBeenCalledTimes(1);
    expect(replacementCredentials).not.toHaveBeenCalled();
    mounted.unmount();
    const replacement = next.session.initialize.mock.calls[0]?.[0];
    if (replacement === undefined) {
      throw new Error('Replacement was not initialized');
    }
    expect(
      Exit.isFailure(await Effect.runPromiseExit(replacement.getCredentials())),
    ).toBe(true);
    expect(replacementCredentials).not.toHaveBeenCalled();
  });
});

export function useSessionInitializationTypeAssertions() {
  const { session } = makeServiceFixture();
  useInitializeServiceSession({
    session,
    claims: {},
    onStageFailure: event => {
      assert<Equals<typeof event, IServiceStageFailure>>();
    },
    onAdmissionFailure: event => {
      assert<Equals<typeof event, ISessionCommandFailure>>();
    },
    onExecutionFailure: event => {
      assert<Equals<typeof event, ISessionCommandFailure>>();
    },
    onSharedWorkerConnectionFailure: event => {
      assert<Equals<typeof event, { message: string }>>();
    },
    onSharedWorkerPersistenceFailure: event => {
      assert<Equals<typeof event, { message: string }>>();
    },
    onAuthenticationFailure: event => {
      assert<Equals<typeof event, { message: string }>>();
    },
    onServerProtocolFailure: event => {
      assert<Equals<typeof event, { message: string }>>();
    },
  });
  // @ts-expect-error Aggregate initialization requires an aggregate session.
  useInitializeAggregateSession({ session, claims: {} });
  const aggregate = makeAggregateFixture();
  // @ts-expect-error Service initialization requires a service session.
  useInitializeServiceSession({ session: aggregate.session, claims: {} });
  useInitializeServiceSession({
    session: makeCredentialServiceFixture().session,
    // @ts-expect-error Sessions with a credentials codec require getCredentials.
    claims: {},
  });
  useInitializeAggregateSession({
    session: aggregate.session,
    // @ts-expect-error Claim-based sessions cannot accept a credentials provider.
    getCredentials: () => Effect.succeed('token'),
  });
  const typedClaimsSchema = Schema.Struct({ userId: Schema.String });
  const typedClaimsSession = {
    ...session,
    claimsSchema: typedClaimsSchema,
    initialize: (
      _props: ISessionInitialization<typeof typedClaimsSchema, undefined>,
    ) => Promise.resolve(),
  };
  // @ts-expect-error Claims are inferred from the service session, not the supplied payload.
  useInitializeServiceSession({ session: typedClaimsSession, claims: {} });
  useInitializeServiceSession({
    session: typedClaimsSession,
    claims: { userId: 'user_one' },
  });
}
