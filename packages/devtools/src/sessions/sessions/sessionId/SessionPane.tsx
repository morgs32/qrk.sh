import { useSyncExternalStore, type CSSProperties } from 'react';

import type { IAggregateSession } from '@zerospin/core/aggregateSession/types';
import { NavLink, Outlet, useOutletContext } from 'react-router';
import { useStore } from 'zustand/react';

import type { IDevtoolsServiceSessionEntry } from '../../../types.js';

import { SessionPushControls } from './SessionPushControls';
import { useAggregateSession, useServiceSession } from './useSession';

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
  const aggregateSession = useAggregateSession();
  const serviceSession = useServiceSession();

  if (aggregateSession !== undefined) {
    return <AggregateSessionPane session={aggregateSession} />;
  }

  if (serviceSession !== undefined) {
    return <ServiceSessionPane session={serviceSession} />;
  }

  throw new Error('Session not found');
}

type ISessionStateRows = readonly { key: string; value: unknown }[];

export function SessionStateRoute() {
  const rows = useOutletContext<ISessionStateRows>();
  return <SessionStateTable rows={rows} />;
}

function SessionStateTable({ rows }: { readonly rows: ISessionStateRows }) {
  const cellStyle = {
    padding: '8px 12px',
    borderBottom: '1px solid #e5e7eb',
    textAlign: 'left',
  } satisfies CSSProperties;
  const codeStyle = {
    fontFamily: 'ui-monospace, monospace',
    fontSize: 11,
    backgroundColor: '#f3f4f6',
    borderRadius: 3,
    padding: '2px 4px',
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
  } satisfies CSSProperties;
  return (
    <div style={{ overflow: 'auto' }}>
      <table
        data-testid="session-state"
        style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}
      >
        <thead>
          <tr>
            <th scope="col" style={cellStyle}>
              Key
            </th>
            <th scope="col" style={cellStyle}>
              Value
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ key, value }) => (
            <tr key={key}>
              <th scope="row" style={{ ...cellStyle, fontWeight: 400 }}>
                <code style={codeStyle}>{key}</code>
              </th>
              <td style={cellStyle}>
                <code style={codeStyle}>
                  {typeof value === 'string'
                    ? value
                    : JSON.stringify(value, null, 2)}
                </code>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AggregateSessionPane(props: { readonly session: IAggregateSession }) {
  const { session } = props;

  const isInitialized = useStore(session.store, state => state.isInitialized);
  const sessionStatus = useStore(session.store, state => state.sessionStatus);
  const backupState = useStore(session.store, state => state.backupState);
  const nodeState = useStore(session.store, state => state.nodeState);
  const aggregateIndex = useStore(session.store, state => state.aggregateIndex);
  const executedIndex = useStore(session.store, state => state.executedIndex);
  const pushIndex = useStore(session.store, state => state.pushIndex);

  const rows: ISessionStateRows = [
    { key: 'sessionStatus', value: sessionStatus },
    ...(backupState === null
      ? []
      : [{ key: 'backupState.status', value: backupState.status }]),
    { key: 'aggregateIndex', value: aggregateIndex },
    { key: 'executedIndex', value: executedIndex },
    ...(nodeState == null ? [{ key: 'pushIndex', value: pushIndex }] : []),
    ...(backupState === null
      ? []
      : [{ key: 'backupState.failure', value: backupState.failure }]),
    ...Object.entries(nodeState ?? {}).map(([key, value]) => ({
      key: `nodeState.${key}`,
      value,
    })),
  ];

  if (!isInitialized) return <SessionStateTable rows={rows} />;

  return (
    <div style={styles.paneRoot}>
      <div
        style={{
          padding: '4px 12px',
          fontFamily: 'ui-monospace, monospace',
          fontSize: 10,
          borderBottom: '1px solid #e5e7eb',
        }}
      >
        <SessionPushControls key={session.sessionId} />
      </div>
      <div style={styles.tabsHeader}>
        <NavLink
          to="state"
          style={({ isActive }) => ({
            ...styles.tab,
            ...(isActive ? styles.tabActive : {}),
          })}
        >
          State
        </NavLink>
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
        <Outlet context={rows} />
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
  const sessionStatus = useSyncExternalStore(
    session.subscribe,
    session.getSessionStatus,
    session.getSessionStatus,
  );
  const nodeState = useSyncExternalStore(
    session.subscribe,
    session.getNodeState,
    session.getNodeState,
  );
  const backupState = useSyncExternalStore(
    session.subscribe,
    session.getBackupState,
    session.getBackupState,
  );
  const serviceIndex = useSyncExternalStore(
    session.subscribe,
    session.getServiceIndex,
    session.getServiceIndex,
  );
  const rows: ISessionStateRows = [
    { key: 'sessionStatus', value: sessionStatus },
    ...(backupState === null
      ? []
      : [{ key: 'backupState.status', value: backupState.status }]),
    { key: 'serviceIndex', value: serviceIndex },
    ...(backupState === null
      ? []
      : [{ key: 'backupState.failure', value: backupState.failure }]),
    ...Object.entries(nodeState ?? {}).map(([key, value]) => ({
      key: `nodeState.${key}`,
      value,
    })),
  ];
  if (!isInitialized) return <SessionStateTable rows={rows} />;

  return (
    <div style={styles.paneRoot}>
      <div style={styles.tabsHeader}>
        <NavLink
          to="state"
          style={({ isActive }) => ({
            ...styles.tab,
            ...(isActive ? styles.tabActive : {}),
          })}
        >
          State
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
        <Outlet context={rows} />
      </div>
    </div>
  );
}
