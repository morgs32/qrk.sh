import { newMessagePortRpcSession } from 'capnweb';

import { NodeCatalog } from './Node/NodeCatalog.ts';
import { NodeHost } from './Node/NodeHost.ts';
import { openNodeStorage } from './Node/openNodeStorage.ts';
import { NodeWorker } from './NodeWorker/NodeWorker.ts';

const locked = Promise.withResolvers<void>();
void navigator.locks
  .request('zerospin-nodes-lifetime', { mode: 'exclusive' }, async () => {
    locked.resolve();
    await new Promise(() => undefined);
  })
  .catch(locked.reject);
const host = (async () => {
  await locked.promise;
  const open = await openNodeStorage();
  const catalog = new NodeCatalog(await open('catalog'));
  await catalog.initialize();
  return new NodeHost(catalog, open);
})();
void host.catch(() => undefined);

globalThis.addEventListener('connect', event => {
  if (!(event instanceof MessageEvent)) return;
  const port = event.ports[0];
  if (port === undefined) return;
  const api = new NodeWorker(host);
  const session = newMessagePortRpcSession(port, api);
  session.onRpcBroken(() => {
    api[Symbol.dispose]();
    port.close();
  });
  port.start();
});
