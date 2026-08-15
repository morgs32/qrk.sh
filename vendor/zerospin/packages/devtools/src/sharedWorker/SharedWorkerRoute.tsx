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
  IDevtoolsAggregateFrontendReplicaDiagnostic,
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
  const [aggregateReplicas, setAggregateReplicas] = useState<
    readonly IDevtoolsAggregateFrontendReplicaDiagnostic[]
  >([]);
  const [serviceReplicas, setServiceReplicas] = useState<
    readonly IDevtoolsServiceFrontendReplicaDiagnostic[]
  >([]);
  const [aggregateFailure, setAggregateFailure] = useState<string | null>(null);
  const [serviceFailure, setServiceFailure] = useState<string | null>(null);
  const [pushPausedByTarget, setPushPausedByTarget] = useState<
    Record<string, boolean | undefined>
  >({});
  const [targetOperationByTarget, setTargetOperationByTarget] = useState<
    Record<string, boolean | undefined>
  >({});
  const [targetResultByTarget, setTargetResultByTarget] = useState<
    Record<string, string | undefined>
  >({});

  const refresh = useCallback(async () => {
    const refreshGeneration = refreshGenerationRef.current + 1;
    refreshGenerationRef.current = refreshGeneration;
    setIsLoading(true);

    // These are the only two SharedWorker operations available to this
    // component. Config binds them to the separate, read-only UserPartitionRepo
    // listing methods before registering the root with DevTools.
    const [aggregateResult, serviceResult] = await Promise.allSettled([
      root.listAggregateFrontendReplicas(),
      root.listServiceFrontendReplicas(),
    ]);

    if (refreshGenerationRef.current !== refreshGeneration) {
      return;
    }

    if (aggregateResult.status === 'fulfilled') {
      if (aggregateResult.value._tag === 'Right') {
        const replicas = aggregateResult.value.right;
        setAggregateReplicas(replicas);
        setAggregateFailure(null);
        const targets = new Map<
          string,
          IDevtoolsAggregateFrontendReplicaDiagnostic
        >();
        for (const replica of replicas) {
          targets.set(
            JSON.stringify([
              root.systemId,
              root.userId,
              replica.aggregateName,
              replica.aggregateId,
              replica.frontendName,
              replica.aggregateFrontendLockKey,
            ]),
            replica,
          );
        }
        const pauseResults = await Promise.allSettled(
          [...targets].map(async ([targetKey, replica]) => ({
            targetKey,
            result: await root.getPushPaused({
              aggregateId: replica.aggregateId,
              aggregateName: replica.aggregateName,
              frontendName: replica.frontendName,
              aggregateFrontendLockKey: replica.aggregateFrontendLockKey,
            }),
          })),
        );
        if (refreshGenerationRef.current !== refreshGeneration) return;
        setPushPausedByTarget(current => {
          const next = { ...current };
          for (const pauseResult of pauseResults) {
            if (
              pauseResult.status === 'fulfilled' &&
              pauseResult.value.result._tag === 'Right'
            ) {
              next[pauseResult.value.targetKey] =
                pauseResult.value.result.right;
            }
          }
          return next;
        });
      } else {
        setAggregateReplicas([]);
        setAggregateFailure(JSON.stringify(aggregateResult.value.left));
      }
    } else {
      setAggregateReplicas([]);
      setAggregateFailure(String(aggregateResult.reason));
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

  useEffect(() => {
    if (!aggregateReplicas.some(replica => replica.pushInFlight)) return;
    const timeout = setTimeout(() => void refresh(), 250);
    return () => clearTimeout(timeout);
  }, [aggregateReplicas, refresh]);

  const aggregateTargetGroups = new Map<
    string,
    IDevtoolsAggregateFrontendReplicaDiagnostic[]
  >();
  for (const replica of aggregateReplicas) {
    const targetKey = JSON.stringify([
      root.systemId,
      root.userId,
      replica.aggregateName,
      replica.aggregateId,
      replica.frontendName,
      replica.aggregateFrontendLockKey,
    ]);
    const targetReplicas = aggregateTargetGroups.get(targetKey) ?? [];
    targetReplicas.push(replica);
    aggregateTargetGroups.set(targetKey, targetReplicas);
  }

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
            <strong>User:</strong> {root.userId}
          </div>
          <div>
            <strong>Mode:</strong> {root.mode}
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

      <section aria-label="Aggregate frontend replicas">
        <h3 style={{ margin: '0 0 6px', fontSize: 12 }}>
          Aggregate replicas ({aggregateReplicas.length})
        </h3>
        {aggregateFailure === null ? null : (
          <p role="alert" style={{ margin: '0 0 6px', color: '#b91c1c' }}>
            Aggregate listing failed: {aggregateFailure}
          </p>
        )}
        {aggregateTargetGroups.size === 0 ? (
          <p style={{ margin: 0, ...cellStyle }}>No aggregate replicas</p>
        ) : (
          [...aggregateTargetGroups].map(([targetKey, replicas]) => {
            const target = replicas[0]!;
            const pushPaused = pushPausedByTarget[targetKey];
            const isOperating = targetOperationByTarget[targetKey] === true;
            return (
              <section
                key={targetKey}
                data-testid={`shared-worker-target-${targetKey}`}
                style={{
                  marginBottom: 10,
                  border: '1px solid #e5e7eb',
                  borderRadius: 5,
                  overflow: 'hidden',
                }}
              >
                <header
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 10,
                    padding: 8,
                    background: '#f9fafb',
                  }}
                >
                  <div
                    style={{
                      fontFamily: 'ui-monospace, monospace',
                      fontSize: 11,
                    }}
                  >
                    {root.systemId}/{root.userId}/{target.aggregateName}/
                    {target.aggregateId}/{target.frontendName}
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <span style={{ fontSize: 11 }}>
                      {pushPaused === undefined
                        ? 'pause state loading'
                        : pushPaused
                          ? 'paused'
                          : 'running'}
                    </span>
                    <button
                      type="button"
                      disabled={pushPaused === undefined || isOperating}
                      onClick={() => {
                        setTargetOperationByTarget(current => ({
                          ...current,
                          [targetKey]: true,
                        }));
                        setTargetResultByTarget(current => ({
                          ...current,
                          [targetKey]: undefined,
                        }));
                        void (async () => {
                          try {
                            const result = await root.setPushPaused({
                              aggregateId: target.aggregateId,
                              aggregateName: target.aggregateName,
                              frontendName: target.frontendName,
                              aggregateFrontendLockKey:
                                target.aggregateFrontendLockKey,
                              pushPaused: !pushPaused,
                            });
                            if (result._tag === 'Left') {
                              setTargetResultByTarget(current => ({
                                ...current,
                                [targetKey]: `failure: ${JSON.stringify(result.left)}`,
                              }));
                              return;
                            }
                            setPushPausedByTarget(current => ({
                              ...current,
                              [targetKey]: !pushPaused,
                            }));
                            setTargetResultByTarget(current => ({
                              ...current,
                              [targetKey]: !pushPaused ? 'paused' : 'resumed',
                            }));
                            await refresh();
                          } catch (cause) {
                            setTargetResultByTarget(current => ({
                              ...current,
                              [targetKey]: `failure: ${String(cause)}`,
                            }));
                          } finally {
                            setTargetOperationByTarget(current => ({
                              ...current,
                              [targetKey]: false,
                            }));
                          }
                        })();
                      }}
                    >
                      {pushPaused ? 'Resume' : 'Pause'}
                    </button>
                    {pushPaused === true ? (
                      <button
                        type="button"
                        disabled={isOperating || target.pushInFlight}
                        onClick={() => {
                          setTargetOperationByTarget(current => ({
                            ...current,
                            [targetKey]: true,
                          }));
                          setTargetResultByTarget(current => ({
                            ...current,
                            [targetKey]: undefined,
                          }));
                          void (async () => {
                            try {
                              const result = await root.pushNow({
                                aggregateId: target.aggregateId,
                                aggregateName: target.aggregateName,
                                frontendName: target.frontendName,
                                aggregateFrontendLockKey:
                                  target.aggregateFrontendLockKey,
                              });
                              if (result._tag === 'Left') {
                                setTargetResultByTarget(current => ({
                                  ...current,
                                  [targetKey]: `failure: ${JSON.stringify(result.left)}`,
                                }));
                              } else if (result.right.status === 'empty') {
                                setTargetResultByTarget(current => ({
                                  ...current,
                                  [targetKey]: 'empty',
                                }));
                              } else if (result.right.status === 'pushed') {
                                setTargetResultByTarget(current => ({
                                  ...current,
                                  [targetKey]: 'pushed',
                                }));
                              } else {
                                const retry = result.right;
                                setTargetResultByTarget(current => ({
                                  ...current,
                                  [targetKey]: `retry-exhausted: ${JSON.stringify(retry.failure)}`,
                                }));
                              }
                              await refresh();
                            } catch (cause) {
                              setTargetResultByTarget(current => ({
                                ...current,
                                [targetKey]: `failure: ${String(cause)}`,
                              }));
                            } finally {
                              setTargetOperationByTarget(current => ({
                                ...current,
                                [targetKey]: false,
                              }));
                            }
                          })();
                        }}
                      >
                        Push now
                      </button>
                    ) : null}
                  </div>
                </header>
                {targetResultByTarget[targetKey] === undefined ? null : (
                  <div
                    role="status"
                    style={{
                      padding: '6px 8px',
                      borderTop: '1px solid #e5e7eb',
                      fontFamily: 'ui-monospace, monospace',
                      fontSize: 11,
                    }}
                  >
                    {targetResultByTarget[targetKey]}
                  </div>
                )}
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={headerCellStyle}>Lock</th>
                      <th style={headerCellStyle}>System version</th>
                      <th style={headerCellStyle}>Status</th>
                      <th style={headerCellStyle}>Database</th>
                      <th style={headerCellStyle}>Indices</th>
                      <th style={headerCellStyle}>Registrations</th>
                      <th style={headerCellStyle}>Socket</th>
                      <th style={headerCellStyle}>Push</th>
                      <th style={headerCellStyle}>Failure</th>
                    </tr>
                  </thead>
                  <tbody>
                    {replicas.map(replica => (
                      <tr key={replica.aggregateFrontendLockKey}>
                        <td style={cellStyle}>
                          {replica.aggregateFrontendLockKey.slice(0, 12)}
                        </td>
                        <td style={cellStyle}>{replica.systemVersion}</td>
                        <td style={cellStyle}>{replica.status}</td>
                        <td style={cellStyle}>{replica.databaseName}</td>
                        <td style={cellStyle}>
                          frontend {replica.frontendIndex}; replica{' '}
                          {replica.replicaIndex}
                        </td>
                        <td style={cellStyle}>
                          {replica.activeRegistrationCount}
                        </td>
                        <td style={cellStyle}>
                          {replica.socketState}; attempt{' '}
                          {replica.reconnectAttempt}
                        </td>
                        <td style={cellStyle}>
                          {replica.pushInFlight ? 'in flight' : 'idle'}
                        </td>
                        <td style={cellStyle}>
                          {replica.lastFailure === null
                            ? 'none'
                            : JSON.stringify(replica.lastFailure)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            );
          })
        )}
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
              <th style={headerCellStyle}>Lock</th>
              <th style={headerCellStyle}>System version</th>
              <th style={headerCellStyle}>Status</th>
              <th style={headerCellStyle}>Database</th>
              <th style={headerCellStyle}>Indices</th>
              <th style={headerCellStyle}>Registrations</th>
              <th style={headerCellStyle}>Socket</th>
              <th style={headerCellStyle}>Failure</th>
            </tr>
          </thead>
          <tbody>
            {serviceReplicas.length === 0 ? (
              <tr>
                <td style={cellStyle} colSpan={9}>
                  No service replicas
                </td>
              </tr>
            ) : (
              serviceReplicas.map(replica => (
                <tr
                  key={`${replica.serviceName}:${replica.userId}:${replica.frontendName}:${replica.serviceFrontendLockKey}`}
                >
                  <td style={cellStyle}>
                    {replica.serviceName}/{replica.frontendName}
                  </td>
                  <td style={cellStyle}>
                    {replica.serviceFrontendLockKey.slice(0, 12)}
                  </td>
                  <td style={cellStyle}>{replica.systemVersion}</td>
                  <td style={cellStyle}>{replica.status}</td>
                  <td style={cellStyle}>{replica.databaseName}</td>
                  <td style={cellStyle}>
                    frontend {replica.frontendIndex}; replica{' '}
                    {replica.replicaIndex}
                  </td>
                  <td style={cellStyle}>{replica.activeRegistrationCount}</td>
                  <td style={cellStyle}>
                    {replica.socketState}; attempt {replica.reconnectAttempt}
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
        No SharedWorker roots are registered by ZerospinApp.Provider.
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
