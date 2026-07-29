import type { ISession, ISessionId } from '@zerospin/core/session/types';
import { useParams } from 'react-router';
import { useStore } from 'zustand/react';

import type { IDevtoolsServiceSessionEntry } from '../../../types.js';
import { zerospinDevtoolsStore } from '../../../zerospinDevtoolsStore.js';

export function useAccountSession(): ISession | undefined {
  const { sessionId } = useParams<{ sessionId: ISessionId }>();
  return useStore(zerospinDevtoolsStore, state =>
    sessionId === undefined
      ? undefined
      : state.accountSessionsById.get(sessionId)?.session,
  );
}

export function useAccountSessionOrThrow(): ISession {
  const session = useAccountSession();
  if (!session) {
    throw new Error('Account session not found');
  }
  return session;
}

export function useServiceSession(): IDevtoolsServiceSessionEntry | undefined {
  const { sessionId } = useParams<{ sessionId: ISessionId }>();
  return useStore(zerospinDevtoolsStore, state =>
    sessionId === undefined
      ? undefined
      : state.serviceSessionsById.get(sessionId),
  );
}

export function useServiceSessionOrThrow(): IDevtoolsServiceSessionEntry {
  const session = useServiceSession();
  if (!session) {
    throw new Error('Service session not found');
  }
  return session;
}
