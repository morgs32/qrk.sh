import { useSyncExternalStore, type CSSProperties } from 'react';

import type { ISession } from '@zerospin/core/session/types';
import { useStore } from 'zustand/react';

import type { IDevtoolsServiceSessionEntry } from '../types.js';

import { SessionsDataCell } from './SessionsDataCell';

export function SessionsActorIdCell(props: {
  readonly session: ISession;
  readonly tdStyle: CSSProperties;
}) {
  const { session, tdStyle } = props;

  const actorId = useStore(
    session.store,
    state => state.actorId ?? 'Initializing...',
  );

  return (
    <SessionsDataCell
      text={actorId}
      ariaLabel="Copy actor id"
      tdStyle={tdStyle}
    />
  );
}

export function ServiceSessionsActorIdCell(props: {
  readonly session: IDevtoolsServiceSessionEntry;
  readonly tdStyle: CSSProperties;
}) {
  const { session, tdStyle } = props;

  const actorId = useSyncExternalStore(
    session.subscribe,
    session.getActorId,
    session.getActorId,
  );

  return (
    <SessionsDataCell
      text={actorId ?? 'Initializing...'}
      ariaLabel="Copy actor id"
      tdStyle={tdStyle}
    />
  );
}
