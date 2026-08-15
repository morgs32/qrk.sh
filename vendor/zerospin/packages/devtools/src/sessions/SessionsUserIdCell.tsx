import { useSyncExternalStore, type CSSProperties } from 'react';

import type { ISession } from '@zerospin/core/session/types';
import { useStore } from 'zustand/react';

import type { IDevtoolsServiceSessionEntry } from '../types.js';

import { SessionsDataCell } from './SessionsDataCell';

export function SessionsUserIdCell(props: {
  readonly session: ISession;
  readonly tdStyle: CSSProperties;
}) {
  const { session, tdStyle } = props;

  const userId = useStore(
    session.store,
    state => state.userId ?? 'Initializing...',
  );

  return (
    <SessionsDataCell
      text={userId}
      ariaLabel="Copy user id"
      tdStyle={tdStyle}
    />
  );
}

export function ServiceSessionsUserIdCell(props: {
  readonly session: IDevtoolsServiceSessionEntry;
  readonly tdStyle: CSSProperties;
}) {
  const { session, tdStyle } = props;

  const userId = useSyncExternalStore(
    session.subscribe,
    session.getUserId,
    session.getUserId,
  );

  return (
    <SessionsDataCell
      text={userId ?? 'Initializing...'}
      ariaLabel="Copy user id"
      tdStyle={tdStyle}
    />
  );
}
