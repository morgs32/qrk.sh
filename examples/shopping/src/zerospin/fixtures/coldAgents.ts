import assert from 'node:assert/strict';

const replacements: {
  object: object;
  key: string;
  descriptor: PropertyDescriptor | undefined;
}[] = [];
function forbid(object: object, key: string) {
  replacements.push({
    object,
    key,
    descriptor: Object.getOwnPropertyDescriptor(object, key),
  });
  Object.defineProperty(object, key, {
    configurable: true,
    value() {
      throw new Error(`Cold agents import acquired ${key}`);
    },
  });
}
forbid(globalThis, 'fetch');
for (const key of ['Worker', 'SharedWorker', 'WebSocket']) {
  forbid(globalThis, key);
}
for (const key of [
  'compile',
  'instantiate',
  'compileStreaming',
  'instantiateStreaming',
]) {
  forbid(WebAssembly, key);
}
try {
  const { agents } = await import('../../../agents');
  for (const session of Object.values(agents)) {
    assert.equal(session.connection.getState().status, 'idle');
    assert.equal(session.store.getState().db, null);
    assert.equal(session.store.getState().isInitialized, false);
    assert.throws(() => session.runtime);
  }
  assert.deepEqual(Object.keys(agents), ['purchases']);
  assert.deepEqual(Object.keys(agents.purchases.definition.selections), [
    'purchase',
    'purchaseItem',
  ]);
  assert.deepEqual(
    agents.purchases.definition.contractBindings.createTrackingLabel.bind,
    { purchaseId: 'id' },
  );
  assert.equal(
    agents.purchases.definition.contracts.createTrackingLabel.commandName,
    'createTrackingLabel',
  );
  console.log(
    'PASS: Node imports browser-safe agents without runtime, SQLite, WASM, socket, worker or network acquisition',
  );
} finally {
  for (const { object, key, descriptor } of replacements.reverse()) {
    if (descriptor) Object.defineProperty(object, key, descriptor);
    else Reflect.deleteProperty(object, key);
  }
}
