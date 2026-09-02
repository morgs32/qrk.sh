import { useEffect, useRef, useState } from 'react';

import { newWebSocketRpcSession, type RpcStub } from 'capnweb';
import { createRoot } from 'react-dom/client';

import type { CounterApi, GatewayApi } from './Worker';

function App() {
  const [counterId, setCounterId] = useState('counter-1');
  const [status, setStatus] = useState<
    'disconnected' | 'connecting' | 'connected'
  >('disconnected');
  const [count, setCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const gatewayApiRef = useRef<RpcStub<GatewayApi> | null>(null);
  const counterApiRef = useRef<RpcStub<CounterApi> | null>(null);

  useEffect(() => {
    return () => {
      const counterApi = counterApiRef.current;
      const gatewayApi = gatewayApiRef.current;

      counterApiRef.current = null;
      gatewayApiRef.current = null;

      counterApi?.[Symbol.dispose]();
      gatewayApi?.[Symbol.dispose]();
    };
  }, []);

  return (
    <main>
      <label>
        Counter ID
        <input
          value={counterId}
          onChange={event => setCounterId(event.target.value)}
        />
      </label>
      <button
        type="button"
        disabled={status !== 'disconnected'}
        onClick={async () => {
          if (gatewayApiRef.current !== null) return;

          const trimmedCounterId = counterId.trim();
          if (trimmedCounterId.length === 0) {
            setError('Counter ID is required.');
            return;
          }

          setCount(null);
          setError(null);

          const url = new URL(window.location.href);
          url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
          url.pathname = '/api/counter';
          url.search = '';
          url.hash = '';

          let gatewayApi: RpcStub<GatewayApi>;
          try {
            gatewayApi = newWebSocketRpcSession<GatewayApi>(url.href);
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : String(cause));
            return;
          }

          gatewayApiRef.current = gatewayApi;
          setStatus('connecting');

          try {
            const counterApi = await gatewayApi.getCounterApi(trimmedCounterId);

            if (gatewayApiRef.current !== gatewayApi) {
              counterApi[Symbol.dispose]();
              return;
            }

            counterApiRef.current = counterApi;
            setStatus('connected');
          } catch (cause) {
            if (gatewayApiRef.current !== gatewayApi) return;

            gatewayApiRef.current = null;
            gatewayApi[Symbol.dispose]();
            setStatus('disconnected');
            setError(cause instanceof Error ? cause.message : String(cause));
          }
        }}
      >
        Connect
      </button>
      <button
        type="button"
        disabled={status !== 'connected'}
        onClick={async () => {
          const counterApi = counterApiRef.current;
          if (counterApi === null) return;

          setError(null);

          try {
            const nextCount = await counterApi.increment();
            if (counterApiRef.current === counterApi) {
              setCount(nextCount);
            }
          } catch (cause) {
            if (counterApiRef.current === counterApi) {
              setError(cause instanceof Error ? cause.message : String(cause));
            }
          }
        }}
      >
        Increment
      </button>
      <button
        type="button"
        disabled={status === 'disconnected'}
        onClick={() => {
          const counterApi = counterApiRef.current;
          const gatewayApi = gatewayApiRef.current;

          counterApiRef.current = null;
          gatewayApiRef.current = null;

          counterApi?.[Symbol.dispose]();
          gatewayApi?.[Symbol.dispose]();

          setCount(null);
          setError(null);
          setStatus('disconnected');
        }}
      >
        Disconnect
      </button>
      <p>Status: {status}</p>
      <p>Count: {count ?? '—'}</p>
      {error === null ? null : <p>Error: {error}</p>}
    </main>
  );
}

const rootElement = document.getElementById('root');

if (rootElement === null) {
  throw new Error('Missing root element.');
}

createRoot(rootElement).render(<App />);
