import { useSyncExternalStore, type CSSProperties } from 'react';

import type { IAggregateSession } from '@zerospin/core/aggregateSession/types';
import { useStore } from 'zustand/react';

import type { IDevtoolsServiceSessionEntry } from '../types.js';

import { SessionsDataCell } from './SessionsDataCell';

export function SessionsClaimsCell(props: {
  readonly session: IAggregateSession;
  readonly tdStyle: CSSProperties;
}) {
  const { session, tdStyle } = props;

  const text = useStore(session.store, state =>
    state.isInitialized ? JSON.stringify(state.claims) : 'Initializing...',
  );

  return (
    <SessionsDataCell text={text} ariaLabel="Copy claims" tdStyle={tdStyle} />
  );
}

export function ServiceSessionsClaimsCell(props: {
  readonly session: IDevtoolsServiceSessionEntry;
  readonly tdStyle: CSSProperties;
}) {
  const { session, tdStyle } = props;

  const text = useSyncExternalStore(
    session.subscribe,
    () =>
      session.getIsInitialized()
        ? JSON.stringify(session.getClaims())
        : 'Initializing...',
    () =>
      session.getIsInitialized()
        ? JSON.stringify(session.getClaims())
        : 'Initializing...',
  );

  return (
    <SessionsDataCell text={text} ariaLabel="Copy claims" tdStyle={tdStyle} />
  );
}
