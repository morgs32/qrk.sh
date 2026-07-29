import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react';

import { useStore } from 'zustand/react';
import { useShallow } from 'zustand/react/shallow';

import type {
  IDevtoolsAccountFrontendReplicaDiagnostic,
  IDevtoolsServiceFrontendReplicaDiagnostic,
  IDevtoolsSharedWorkerRootDiagnostics,
} from '../types.js';
import { zerospinDevtoolsStore } from '../zerospinDevtoolsStore.js';

const tableStyle = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: 11,
} satisfies CSSProperties;

const headerCellStyle = {
  padding: '5px 7px',
  borderBottom: '1px solid #d1d5db',
  color: '#4b5563',
  fontWeight: 600,
  textAlign: 'left',
  whiteSpace: 'nowrap',
} satisfies CSSProperties;

const cellStyle = {
  padding: '5px 7px',
  borderBottom: '1px solid #e5e7eb',
  color: '#111827',
  fontFamily: 'ui-monospace, monospace',
  verticalAlign: 'top',
} satisfies CSSProperties;

function SharedWorkerRootDiagnostics(props: {
  readonly root: IDevtoolsSharedWorkerRootDiagnostics;
}) {
  const { root } = props;
  const refreshGenerationRef = useRef(0);
  const [isLoading, setIsLoading] = useState(true);
  const [accountReplicas, setAccountReplicas] = useState<
    readonly IDevtoolsAccountFrontendReplicaDiagnostic[]
  >([]);
  const [serviceReplicas, setServiceReplicas] = useState<
    readonly IDevtoolsServiceFrontendReplicaDiagnostic[]
  >([]);
  const [accountFailure, setAccountFailure] = useState<string | null>(null);
  const [serviceFailure, setServiceFailure] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const refreshGeneration = refreshGenerationRef.current + 1;
    refreshGenerationRef.current = refreshGeneration;
    setIsLoading(true);

    // These are the only two SharedWorker operations available to this
    // component. Config binds them to the separate, read-only PartitionApi
    // listing methods before registering the root with DevTools.
    const [accountResult, serviceResult] = await Promise.allSettled([
      root.listAccountFrontendReplicas(),
      root.listServiceFrontendReplicas(),
    ]);

    if (refreshGenerationRef.current !== refreshGeneration) {
      return;
    }

    if (accountResult.status === 'fulfilled') {
      if (accountResult.value._tag === 'Right') {
        setAccountReplicas(accountResult.value.right);
        setAccountFailure(null);
      } else {
        setAccountReplicas([]);
        setAccountFailure(JSON.stringify(accountResult.value.left));
      }
    } else {
      setAccountReplicas([]);
      setAccountFailure(String(accountResult.reason));
    }

    if (serviceResult.status === 'fulfilled') {
      if (serviceResult.value._tag === 'Right') {
        setServiceReplicas(serviceResult.value.right);
        setServiceFailure(null);
      } else {
        setServiceReplicas([]);
        setServiceFailure(JSON.stringify(serviceResult.value.left));
      }
    } else {
      setServiceReplicas([]);
      setServiceFailure(String(serviceResult.reason));
    }

    setIsLoading(false);
  }, [root]);

  useEffect(() => {
    void refresh();
    return () => {
      refreshGenerationRef.current += 1;
    };
  }, [refresh]);

  return (
    <section
      data-testid={`shared-worker-root-${root.id}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        padding: 12,
        border: '1px solid #d1d5db',
        borderRadius: 6,
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 11 }}>
          <div>
            <strong>System:</strong> {root.systemId}
          </div>
          <div>
            <strong>Generation:</strong> {root.generationId}
          </div>
          <div>
            <strong>Partition:</strong> {root.partitionKey}
          </div>
        </div>
        <button
          type="button"
          disabled={isLoading}
          onClick={() => void refresh()}
        >
          {isLoading ? 'Refreshing…' : 'Refresh'}
        </button>
      </header>

      <section aria-label="Account frontend replicas">
        <h3 style={{ margin: '0 0 6px', fontSize: 12 }}>
          Account replicas ({accountReplicas.length})
        </h3>
        {accountFailure === null ? null : (
          <p role="alert" style={{ margin: '0 0 6px', color: '#b91c1c' }}>
            Account listing failed: {accountFailure}
          </p>
        )}
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={headerCellStyle}>Target</th>
              <th style={headerCellStyle}>Version</th>
              <th style={headerCellStyle}>Role</th>
              <th style={headerCellStyle}>Status</th>
              <th style={headerCellStyle}>Database</th>
              <th style={headerCellStyle}>Indices</th>
              <th style={headerCellStyle}>Providers</th>
              <th style={headerCellStyle}>Socket</th>
              <th style={headerCellStyle}>Transition</th>
              <th style={headerCellStyle}>Journal</th>
              <th style={headerCellStyle}>Failure</th>
            </tr>
          </thead>
          <tbody>
            {accountReplicas.length === 0 ? (
              <tr>
                <td style={cellStyle} colSpan={11}>
                  No account replicas
                </td>
              </tr>
            ) : (
              accountReplicas.map(replica => (
                <tr
                  key={`${replica.accountId}:${replica.actorId}:${replica.frontendName}:${replica.frontendVersion}`}
                >
                  <td style={cellStyle}>
                    {replica.accountName}/{replica.actorName}/
                    {replica.frontendName}
                  </td>
                  <td style={cellStyle}>{replica.frontendVersion}</td>
                  <td style={cellStyle}>{replica.role}</td>
                  <td style={cellStyle}>{replica.status}</td>
                  <td style={cellStyle}>{replica.databaseName}</td>
                  <td style={cellStyle}>
                    frontend {replica.frontendIndex}; replica{' '}
                    {replica.replicaIndex}
                  </td>
                  <td style={cellStyle}>{replica.activeProviderCount}</td>
                  <td style={cellStyle}>
                    {replica.socketState}; attempt {replica.reconnectAttempt}
                  </td>
                  <td style={cellStyle}>
                    {replica.hasPendingTransition ? 'pending' : 'none'}
                  </td>
                  <td style={cellStyle}>{replica.journalHealth}</td>
                  <td style={cellStyle}>
                    {replica.lastFailure === null
                      ? 'none'
                      : JSON.stringify(replica.lastFailure)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      <section aria-label="Service frontend replicas">
        <h3 style={{ margin: '0 0 6px', fontSize: 12 }}>
          Service replicas ({serviceReplicas.length})
        </h3>
        {serviceFailure === null ? null : (
          <p role="alert" style={{ margin: '0 0 6px', color: '#b91c1c' }}>
            Service listing failed: {serviceFailure}
          </p>
        )}
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={headerCellStyle}>Target</th>
              <th style={headerCellStyle}>Version</th>
              <th style={headerCellStyle}>Role</th>
              <th style={headerCellStyle}>Status</th>
              <th style={headerCellStyle}>Database</th>
              <th style={headerCellStyle}>Indices</th>
              <th style={headerCellStyle}>Providers</th>
              <th style={headerCellStyle}>Socket</th>
              <th style={headerCellStyle}>Transition</th>
              <th style={headerCellStyle}>Failure</th>
            </tr>
          </thead>
          <tbody>
            {serviceReplicas.length === 0 ? (
              <tr>
                <td style={cellStyle} colSpan={10}>
                  No service replicas
                </td>
              </tr>
            ) : (
              serviceReplicas.map(replica => (
                <tr
                  key={`${replica.serviceName}:${replica.actorId}:${replica.frontendName}:${replica.frontendVersion}`}
                >
                  <td style={cellStyle}>
                    {replica.serviceName}/{replica.actorName}/
                    {replica.frontendName}
                  </td>
                  <td style={cellStyle}>{replica.frontendVersion}</td>
                  <td style={cellStyle}>{replica.role}</td>
                  <td style={cellStyle}>{replica.status}</td>
                  <td style={cellStyle}>{replica.databaseName}</td>
                  <td style={cellStyle}>
                    frontend {replica.frontendIndex}; replica{' '}
                    {replica.replicaIndex}
                  </td>
                  <td style={cellStyle}>{replica.activeProviderCount}</td>
                  <td style={cellStyle}>
                    {replica.socketState}; attempt {replica.reconnectAttempt}
                  </td>
                  <td style={cellStyle}>
                    {replica.pendingTransition === null
                      ? 'none'
                      : `target ${replica.pendingTransition.generationId}/${replica.pendingTransition.serviceName}/${replica.pendingTransition.actorName}/${replica.pendingTransition.frontendName}@${replica.pendingTransition.frontendVersion}; boundary ${replica.pendingTransition.appliedBoundaryIndex}; remaining ${replica.pendingTransition.remainingBoundaries.length}`}
                  </td>
                  <td style={cellStyle}>
                    {replica.lastFailure === null
                      ? 'none'
                      : JSON.stringify(replica.lastFailure)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

    </section>
  );
}

export function SharedWorkerRoute() {
  const roots = useStore(
    zerospinDevtoolsStore,
    useShallow(state => Array.from(state.sharedWorkerRootsById.values())),
  );

  if (roots.length === 0) {
    return (
      <p style={{ margin: 0, padding: 12 }}>
        No SharedWorker roots are registered by ZerospinConfig.
      </p>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        height: '100%',
        padding: 12,
        boxSizing: 'border-box',
        overflow: 'auto',
      }}
    >
      {roots.map(root => (
        <SharedWorkerRootDiagnostics key={root.id} root={root} />
      ))}
    </div>
  );
}
