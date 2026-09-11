import { useSyncExternalStore, type CSSProperties } from 'react';

import type { ISession } from '@zerospin/core/session/types';
import { useStore } from 'zustand/react';

import type { IDevtoolsServiceSessionEntry } from '../types.js';

import { SessionsDataCell } from './SessionsDataCell';

export function SessionsIdentityKeyCell(props: {
  readonly session: ISession;
  readonly tdStyle: CSSProperties;
}) {
  const { session, tdStyle } = props;

  const identityKey = useStore(
    session.store,
    state => state.identityKey ?? 'Initializing...',
  );

  return (
    <SessionsDataCell
      text={identityKey}
      ariaLabel="Copy identity key"
      tdStyle={tdStyle}
    />
  );
}

export function ServiceSessionsIdentityKeyCell(props: {
  readonly session: IDevtoolsServiceSessionEntry;
  readonly tdStyle: CSSProperties;
}) {
  const { session, tdStyle } = props;

  const identityKey = useSyncExternalStore(
    session.subscribe,
    session.getIdentityKey,
    session.getIdentityKey,
  );

  return (
    <SessionsDataCell
      text={identityKey ?? 'Initializing...'}
      ariaLabel="Copy identity key"
      tdStyle={tdStyle}
    />
  );
}
