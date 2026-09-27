import { useSyncExternalStore, type CSSProperties } from 'react';

import type { IAggregateSession } from '@zerospin/core/aggregateSession/types';
import { useStore } from 'zustand/react';

import type { IDevtoolsServiceSessionEntry } from '../types.js';

import { SessionsDataCell } from './SessionsDataCell';

export function SessionsIdentityCell(props: {
  readonly session: IAggregateSession;
  readonly tdStyle: CSSProperties;
}) {
  const { session, tdStyle } = props;

  const text = useStore(session.store, state =>
    state.isInitialized ? JSON.stringify(state.identity) : 'Initializing...',
  );

  return (
    <SessionsDataCell text={text} ariaLabel="Copy identity" tdStyle={tdStyle} />
  );
}

export function ServiceSessionsIdentityCell(props: {
  readonly session: IDevtoolsServiceSessionEntry;
  readonly tdStyle: CSSProperties;
}) {
  const { session, tdStyle } = props;

  const text = useSyncExternalStore(
    session.subscribe,
    () =>
      session.getIsInitialized()
        ? JSON.stringify(session.getIdentity())
        : 'Initializing...',
    () =>
      session.getIsInitialized()
        ? JSON.stringify(session.getIdentity())
        : 'Initializing...',
  );

  return (
    <SessionsDataCell text={text} ariaLabel="Copy identity" tdStyle={tdStyle} />
  );
}
