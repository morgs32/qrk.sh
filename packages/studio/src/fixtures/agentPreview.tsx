import { makeAgentSession } from '@zerospin/browser/makeAgentSession';
import type { IAgentSpec } from '@zerospin/core/system/types';
import { encodeShape, primitives } from '@zerospin/schema';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';

import { AgentPreview } from '../AgentPreview.js';
import '../styles.css';

const agent: IAgentSpec = {
  name: 'positiveItems',
  aggregateName: 'fixture',
  aggregateVersion: '1.0.0',
  actorName: 'preview',
  actorVersion: '1.0.0',
  query: { modelName: 'item', where: { amount: { gt: 0 } } },
  models: {
    item: {
      modelName: 'item',
      version: '1.0.0',
      abbreviation: 'itm',
      indexes: [],
      properties: encodeShape({
        id: primitives.primaryKey({ abbreviation: 'itm' }),
        modelName: primitives.text(),
        version: primitives.text(),
        createdAt: primitives.date(),
        updatedAt: primitives.date(),
        amount: primitives.integer(),
      }),
    },
  },
};
const resource = (amount: number) => ({
  id: 'itm_fixture',
  modelName: 'item',
  version: '1.0.0',
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
  amount,
});
function snapshot(aggregateId: string, amount = 1) {
  return {
    aggregateId,
    aggregateName: 'fixture',
    aggregateVersion: '1.0.0',
    actorName: 'preview',
    actorVersion: '1.0.0',
    sessionName: 'agent:positiveItems',
    claims: { aggregateId },
    aggregateIndex: 0,
    executedIndex: 0,
    executedHash: '0'.repeat(64),
    resolvedThrough: 0,
    resources: [resource(amount)],
  };
}
class FixtureSocket {
  static instances: FixtureSocket[] = [];
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onclose: ((event: Event) => void) | null = null;
  closed = false;
  constructor(readonly url: string) {
    FixtureSocket.instances.push(this);
  }
  readonly sent: string[] = [];
  send(value: string) {
    this.sent.push(value);
  }
  close() {
    this.closed = true;
  }
  open() {
    this.onopen?.(new Event('open'));
  }
  message(value: unknown) {
    this.onmessage?.(
      new MessageEvent('message', { data: JSON.stringify(value) }),
    );
  }
  output(index: number, amount: number) {
    this.message({
      type: 'aggregateActorOutput',
      output: {
        kind: 'receipt',
        sourceKey: 'fixture',
        sourceResultPosition: index,
        executedIndex: index,
        executedHash: String(index).padStart(64, '0'),
        aggregateIndex: index,
        actorDelta: { upserted: [resource(amount)], deleted: [] },
      },
    });
  }
}
Object.defineProperty(globalThis, 'WebSocket', {
  configurable: true,
  value: FixtureSocket,
});
let infrastructureAcquisitions = 0;
for (const name of ['Worker', 'SharedWorker']) {
  Object.defineProperty(globalThis, name, {
    configurable: true,
    value: class {
      constructor() {
        infrastructureAcquisitions++;
        throw new Error('Durable infrastructure forbidden');
      }
    },
  });
}
const host = document.getElementById('fixture');
if (host === null) throw new Error('Fixture root missing');
const root = createRoot(host);
const report: string[] = [];
function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
  report.push(message);
}
async function until(predicate: () => boolean) {
  const deadline = Date.now() + 10000;
  while (!predicate()) {
    if (Date.now() > deadline) {
      throw new Error(`UI fixture timeout: ${host?.textContent}`);
    }
    await new Promise(resolve => setTimeout(resolve, 20));
  }
}
const sessions: ReturnType<typeof makeAgentSession>[] = [];
async function run() {
  let release:
    | ((value: { snapshot: unknown; webSocketUrl: string }) => void)
    | undefined;
  const session = makeAgentSession({
    agent,
    aggregateId: 'acct_fixture',
    bootstrap: () =>
      new Promise(resolve => {
        release = resolve;
      }),
  });
  sessions.push(session);
  flushSync(() =>
    root.render(
      <main className="p-6">
        <AgentPreview session={session} />
      </main>,
    ),
  );
  const initialized = session.initialize();
  await until(() => release !== undefined);
  assert(
    host?.textContent?.includes('Loading agent snapshot'),
    'Loading snapshot state',
  );
  release?.({
    snapshot: snapshot('acct_fixture'),
    webSocketUrl: 'ws://fixture/preview',
  });
  await initialized;
  const socket = FixtureSocket.instances.at(-1)!;
  socket.open();
  socket.message({ type: 'replay-complete', executedIndex: 0 });
  await until(() => host?.textContent?.includes('itm_fixture') === true);
  assert(
    host?.textContent?.includes('1 results'),
    'Live-query initial row and count',
  );
  assert(
    host?.textContent?.includes('Connection: live'),
    'Live connection state',
  );
  socket.output(1, 7);
  await until(
    () =>
      host?.querySelector('tbody tr')?.lastElementChild?.textContent === '7',
  );
  assert(true, 'useLiveQuery reruns after committed delta');
  socket.output(2, 0);
  await until(() => host?.textContent?.includes('No matching rows.') === true);
  assert(host?.textContent?.includes('0 results'), 'Filtered empty state');
  socket.output(3, 8);
  await until(
    () =>
      host?.querySelector('tbody tr')?.lastElementChild?.textContent === '8',
  );
  const oldCallback = socket.onmessage;
  socket.onclose?.(new Event('close'));
  await until(
    () => host?.textContent?.includes('Connection: reconnecting') === true,
  );
  assert(
    host?.textContent?.includes('retained rows may be stale'),
    'Reconnect keeps rows and shows stale status',
  );
  // Replace before reconnect can acquire another snapshot, matching navigation cleanup.
  flushSync(() =>
    root.render(<main className="p-6">Switching aggregate</main>),
  );
  await session.dispose();
  const replacement = makeAgentSession({
    agent,
    aggregateId: 'acct_replacement',
    bootstrap: async () => ({
      snapshot: snapshot('acct_replacement', 9),
      webSocketUrl: 'ws://fixture/replacement',
    }),
  });
  sessions.push(replacement);
  flushSync(() =>
    root.render(
      <main className="p-6">
        <AgentPreview session={replacement} />
      </main>,
    ),
  );
  await replacement.initialize();
  const nextSocket = FixtureSocket.instances.at(-1)!;
  nextSocket.open();
  nextSocket.message({ type: 'replay-complete', executedIndex: 0 });
  oldCallback?.(
    new MessageEvent('message', {
      data: JSON.stringify({ type: 'state-required' }),
    }),
  );
  await until(
    () =>
      host?.querySelector('tbody tr')?.lastElementChild?.textContent === '9',
  );
  assert(
    replacement.store.getState().status === 'live',
    'Replacement is isolated from late callbacks',
  );
  flushSync(() => root.render(<main className="p-6">Unmounted</main>));
  await replacement.dispose();
  const failure = makeAgentSession({
    agent,
    aggregateId: 'acct_failure',
    bootstrap: async () => {
      throw new Error('Fixture bootstrap failed');
    },
  });
  sessions.push(failure);
  flushSync(() =>
    root.render(
      <main className="p-6">
        <AgentPreview session={failure} />
      </main>,
    ),
  );
  await failure.initialize().catch(() => undefined);
  await until(
    () => host?.textContent?.includes('Fixture bootstrap failed') === true,
  );
  assert(
    host?.textContent?.includes('Connection: error'),
    'Initialization error state',
  );
  assert(
    infrastructureAcquisitions === 0,
    'No Worker or SharedWorker acquired',
  );
  flushSync(() =>
    root.render(
      <main className="space-y-3 p-6">
        <h1 className="text-xl">Independent Studio agent fixture passed</h1>
        <ol>
          {report.map(message => (
            <li key={message}>{message}</li>
          ))}
        </ol>
      </main>,
    ),
  );
}
void run()
  .catch(error => {
    flushSync(() => root.render(<pre role="alert">{String(error)}</pre>));
  })
  .finally(async () => {
    await Promise.all(sessions.map(session => session.dispose()));
  });
