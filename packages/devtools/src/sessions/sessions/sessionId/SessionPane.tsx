import { useSyncExternalStore, type CSSProperties } from 'react';

import type { ISession } from '@zerospin/core/session/types';
import { NavLink, Outlet } from 'react-router';
import { useStore } from 'zustand/react';

import type {
  IDevtoolsServiceSessionEntry,
  IDevtoolsWorkerState,
} from '../../../types.js';

import { SessionToolbar } from './SessionToolbar';
import { useAccountSession, useServiceSession } from './useSession';

const styles = {
  paneRoot: {
    flex: 1,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
  } satisfies CSSProperties,
  tabsHeader: {
    display: 'flex',
    alignItems: 'center',
    flexShrink: 0,
    backgroundColor: '#f3f4f6',
    borderBottom: '1px solid #e5e7eb',
  } satisfies CSSProperties,
  tab: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 12px',
    fontSize: 12,
    fontWeight: 500,
    border: 'none',
    borderBottomWidth: 2,
    borderBottomStyle: 'solid',
    borderBottomColor: 'transparent',
    marginBottom: -1,
    backgroundColor: 'transparent',
    cursor: 'pointer',
    color: '#6b7280',
    fontFamily: 'inherit',
    textDecoration: 'none',
  } satisfies CSSProperties,
  tabActive: {
    borderBottomColor: '#3b82f6',
    color: '#111827',
  } satisfies CSSProperties,
  tabContent: {
    flex: 1,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
  } satisfies CSSProperties,
} as const;

function FileJsonIcon(props: { readonly color: string }) {
  const { color } = props;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={14}
      height={14}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
      <path d="M10 12h4" />
      <path d="M10 16h7" />
    </svg>
  );
}

export function SessionPane() {
  const accountSession = useAccountSession();
  const serviceSession = useServiceSession();

  if (accountSession !== undefined) {
    return <AccountSessionPane session={accountSession} />;
  }

  if (serviceSession !== undefined) {
    return <ServiceSessionPane session={serviceSession} />;
  }

  throw new Error('Session not found');
}

function SessionWorkerState(props: {
  readonly workerState: IDevtoolsWorkerState;
}) {
  const { workerState } = props;

  return (
    <div
      data-testid="session-worker-state"
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '4px 12px',
        padding: '4px 12px',
        borderBottom: '1px solid #e5e7eb',
        color: '#4b5563',
        backgroundColor: '#f9fafb',
        fontFamily: 'ui-monospace, monospace',
        fontSize: 10,
      }}
    >
      <span>mode: {workerState.mode}</span>
      <span>status: {workerState.status}</span>
      <span>bootstrap: {workerState.bootstrapSource ?? 'none'}</span>
      <span>frontend index: {workerState.frontendIndex ?? 'none'}</span>
      <span>replica index: {workerState.replicaIndex ?? 'none'}</span>
      <span>database: {workerState.databaseName ?? 'none'}</span>
      <span>
        failure:{' '}
        {workerState.failure === null
          ? 'none'
          : JSON.stringify(workerState.failure)}
      </span>
    </div>
  );
}

function AccountSessionPane(props: { readonly session: ISession }) {
  const { session } = props;

  const isInitialized = useStore(session.store, state => state.isInitialized);
  const workerState = useStore(session.store, state => state.workerState);

  if (!isInitialized) {
    return <SessionWorkerState workerState={workerState} />;
  }

  return (
    <div style={styles.paneRoot}>
      <SessionWorkerState workerState={workerState} />
      <SessionToolbar />
      <div style={styles.tabsHeader}>
        <NavLink
          to="commands"
          style={({ isActive }) => ({
            ...styles.tab,
            ...(isActive ? styles.tabActive : {}),
          })}
        >
          <FileJsonIcon color="#3b82f6" />
          Commands
        </NavLink>
        <NavLink
          to="database"
          style={({ isActive }) => ({
            ...styles.tab,
            ...(isActive ? styles.tabActive : {}),
          })}
        >
          <FileJsonIcon color="#22c55e" />
          Database
        </NavLink>
        <NavLink
          to="logs"
          style={({ isActive }) => ({
            ...styles.tab,
            ...(isActive ? styles.tabActive : {}),
          })}
        >
          Logs
        </NavLink>
      </div>
      <div style={styles.tabContent}>
        <Outlet />
      </div>
    </div>
  );
}

function ServiceSessionPane(props: {
  readonly session: IDevtoolsServiceSessionEntry;
}) {
  const { session } = props;

  const isInitialized = useSyncExternalStore(
    session.subscribe,
    session.getIsInitialized,
    session.getIsInitialized,
  );
  const workerState = useSyncExternalStore(
    session.subscribe,
    session.getWorkerState,
    session.getWorkerState,
  );

  if (!isInitialized) {
    return <SessionWorkerState workerState={workerState} />;
  }

  return (
    <div style={styles.paneRoot}>
      <SessionWorkerState workerState={workerState} />
      <div style={styles.tabsHeader}>
        <NavLink
          to="database"
          style={({ isActive }) => ({
            ...styles.tab,
            ...(isActive ? styles.tabActive : {}),
          })}
        >
          <FileJsonIcon color="#22c55e" />
          Database
        </NavLink>
        <NavLink
          to="logs"
          style={({ isActive }) => ({
            ...styles.tab,
            ...(isActive ? styles.tabActive : {}),
          })}
        >
          Logs
        </NavLink>
      </div>
      <div style={styles.tabContent}>
        <Outlet />
      </div>
    </div>
  );
}
