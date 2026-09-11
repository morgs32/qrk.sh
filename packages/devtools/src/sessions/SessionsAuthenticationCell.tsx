import { useSyncExternalStore, type CSSProperties } from 'react';

import type { ISession } from '@zerospin/core/session/types';
import { useStore } from 'zustand/react';

import type { IDevtoolsServiceSessionEntry } from '../types.js';

import { SessionsDataCell } from './SessionsDataCell';

export function SessionsAuthenticationCell(props: {
  readonly session: ISession;
  readonly tdStyle: CSSProperties;
}) {
  const { session, tdStyle } = props;

  const authentication = useStore(session.store, state => state.authentication);

  return (
    <SessionsDataCell
      text={
        authentication === null
          ? 'Initializing...'
          : JSON.stringify(authentication)
      }
      ariaLabel="Copy authentication"
      tdStyle={tdStyle}
    />
  );
}

export function ServiceSessionsAuthenticationCell(props: {
  readonly session: IDevtoolsServiceSessionEntry;
  readonly tdStyle: CSSProperties;
}) {
  const { session, tdStyle } = props;

  const authentication = useSyncExternalStore(
    session.subscribe,
    session.getAuthentication,
    session.getAuthentication,
  );

  return (
    <SessionsDataCell
      text={
        authentication === null
          ? 'Initializing...'
          : JSON.stringify(authentication)
      }
      ariaLabel="Copy authentication"
      tdStyle={tdStyle}
    />
  );
}
