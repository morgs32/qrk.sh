import { useEffect, useState, useSyncExternalStore } from 'react';

import type { ISessionId } from '@zerospin/core/aggregateSession/types';
import { useParams } from 'react-router';
import { useStore } from 'zustand/react';

import { zerospinDevtoolsStore } from '../../../zerospinDevtoolsStore.js';

export function SessionPushControls() {
  const { sessionId } = useParams<{ sessionId: ISessionId }>();
  const entry = useStore(zerospinDevtoolsStore, state =>
    sessionId === undefined
      ? undefined
      : state.aggregateSessionsById.get(sessionId),
  );
  const [fallbackPaused, setPushPaused] = useState(false);
  const sharedPaused = useSyncExternalStore(
    entry?.session.store.subscribe ?? (() => () => {}),
    () => entry?.session.store.getState().nodeState?.pushPaused,
  );
  const pushPaused = sharedPaused ?? fallbackPaused;
  const [pushStatus, setPushStatus] = useState('');
  const getPushPaused = entry?.getPushPaused;
  const setPushPausedRpc = entry?.setPushPaused;
  const pushNow = entry?.pushNow;

  useEffect(() => {
    let active = true;
    if (getPushPaused !== undefined) {
      void getPushPaused().then(result => {
        if (active && result._tag === 'Success') {
          setPushPaused(result.success);
        }
      });
    }
    return () => {
      active = false;
    };
  }, [getPushPaused]);

  if (
    getPushPaused === undefined ||
    setPushPausedRpc === undefined ||
    pushNow === undefined
  ) {
    return null;
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '4px 12px',
        fontFamily: 'ui-monospace, monospace',
        fontSize: 10,
        borderBottom: '1px solid #e5e7eb',
      }}
    >
      <label
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        <input
          type="checkbox"
          checked={pushPaused}
          style={{ margin: 0, width: 12, height: 12, accentColor: '#2563eb' }}
          onChange={event => {
            const paused = event.currentTarget.checked;
            void setPushPausedRpc({ pushPaused: paused }).then(result => {
              if (result._tag === 'Success') {
                setPushPaused(paused);
                setPushStatus('');
              } else {
                setPushStatus(`failure: ${result.failure.code}`);
              }
            });
          }}
        />
        pause push
      </label>
      {pushPaused ? (
        <button
          type="button"
          style={{
            border: 'none',
            padding: 0,
            background: 'transparent',
            color: '#2563eb',
            font: 'inherit',
            textDecoration: 'underline',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
          onClick={() => {
            void pushNow().then(result => {
              setPushStatus(
                result._tag === 'Success'
                  ? result.success.status
                  : `failure: ${result.failure.code}`,
              );
            });
          }}
        >
          push now
        </button>
      ) : null}
      {pushStatus ? <span role="status">{pushStatus}</span> : null}
    </div>
  );
}
