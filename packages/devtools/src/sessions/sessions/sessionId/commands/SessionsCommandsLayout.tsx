import { useEffect, useState } from 'react';

import type { ISessionId } from '@zerospin/core/session/types';
import { useParams } from 'react-router';
import { useStore } from 'zustand/react';

import { zerospinDevtoolsStore } from '../../../../zerospinDevtoolsStore.js';

import { SessionsCommandsRowsTable } from './SessionsCommandsRowsTable';

export function SessionsCommandsLayout() {
  const { sessionId } = useParams<{ sessionId: ISessionId }>();
  const entry = useStore(zerospinDevtoolsStore, state =>
    sessionId === undefined
      ? undefined
      : state.aggregateSessionsById.get(sessionId),
  );
  const [pushPaused, setPushPaused] = useState(false);
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

  if (entry === undefined || sessionId === undefined) {
    return null;
  }

  return (
    <div
      style={{
        display: 'flex',
        minHeight: 0,
        flex: 1,
        flexDirection: 'column',
      }}
    >
      {getPushPaused !== undefined &&
      setPushPausedRpc !== undefined &&
      pushNow !== undefined ? (
        <div
          style={{
            alignItems: 'center',
            borderBottom: '1px solid #e5e7eb',
            display: 'flex',
            gap: 8,
            padding: '4px 8px',
          }}
        >
          <button
            type="button"
            onClick={() => {
              void setPushPausedRpc({ pushPaused: !pushPaused }).then(
                result => {
                  if (result._tag === 'Success') {
                    setPushPaused(!pushPaused);
                    setPushStatus(!pushPaused ? 'paused' : 'running');
                  } else {
                    setPushStatus(`failure: ${result.failure.code}`);
                  }
                },
              );
            }}
          >
            {pushPaused ? 'Resume push' : 'Pause push'}
          </button>
          <button
            type="button"
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
            Push now
          </button>
          <span style={{ fontSize: 11 }}>{pushStatus}</span>
        </div>
      ) : null}
      <SessionsCommandsRowsTable session={entry.session} />
    </div>
  );
}
