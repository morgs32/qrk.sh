import { EncodedResourceSchema } from '@zerospin/core/models/EncodedResourceSchema';
import { makeZerospinError } from '@zerospin/error';
import { newMessagePortRpcSession } from 'capnweb';
import { Schema } from 'effect';

import { BrowserSessionApi } from './BrowserSessionApi/BrowserSessionApi.ts';
import { isNodeNetworkUnavailable } from './Node/isNodeNetworkUnavailable.ts';
import { makeNodeDefinition } from './Node/makeNodeDefinition.ts';
import { makeNodeRecovery } from './Node/makeNodeRecovery.ts';
import { Node } from './Node/Node.ts';
import { NodeAuthentication } from './Node/NodeAuthentication.ts';
import { nodeKey } from './Node/nodeKey.ts';
import { nodeNetwork } from './Node/nodeNetwork.ts';
import { NodeRequestSchema } from './Node/nodeRequest.ts';
import { NodeSynchronization } from './Node/NodeSynchronization.ts';
import { openNodeStorage } from './Node/openNodeStorage.ts';
import { sessionDiscovery } from './Node/sessionDiscovery.ts';
import { SharedWorkerApi } from './SharedWorkerApi/SharedWorkerApi.ts';
import { sharedWorkerVersion } from './sharedWorkerVersion.ts';

const attachmentSchema = Schema.Struct({
  request: NodeRequestSchema,
  claims: Schema.Record(Schema.String, Schema.Unknown),
  targetId: Schema.String,
  revision: Schema.Number.check(
    Schema.isInt(),
    Schema.isGreaterThanOrEqualTo(0),
  ),
  online: Schema.Boolean,
  baseline: Schema.NullOr(
    Schema.Struct({
      executedIndex: Schema.Number,
      executedHash: Schema.String,
      resolvedThrough: Schema.Number,
      aggregateIndex: Schema.Number,
      resources: Schema.Array(Schema.toType(EncodedResourceSchema)),
    }),
  ),
});

/** One named worker owns one durable node; each port owns only its attached session. */
export function makeSharedWorker({ sqliteWasmUrl }: { sqliteWasmUrl: string }) {
  const { name } = Schema.decodeUnknownSync(
    Schema.Struct({ name: Schema.String }),
  )(globalThis);
  const prefix = `zerospin:${sharedWorkerVersion}:`;
  if (
    !name.startsWith(prefix) ||
    !/^[a-f0-9]{64}$/.test(name.slice(prefix.length))
  ) {
    throw makeZerospinError({ code: 'node-worker-name-invalid' });
  }
  const key = name.slice(prefix.length);
  let owner:
    | {
        node: Node;
        authentication: NodeAuthentication;
        synchronization: NodeSynchronization;
        close(): Promise<void>;
      }
    | undefined;
  let serial: Promise<unknown> = Promise.resolve();
  let generation = 0;
  let activeRevision = 0;
  const attachments = new Map<object, () => void>();
  const locked = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  void navigator.locks
    .request(`${name}:lifetime`, { mode: 'exclusive' }, async () => {
      locked.resolve();
      await release.promise;
    })
    .catch(locked.reject);
  void locked.promise.catch(() => undefined);

  const runtime: ConstructorParameters<typeof SharedWorkerApi>[0] = {
    async ready() {
      await locked.promise;
      return { version: sharedWorkerVersion };
    },
    attach(input, getAdmission) {
      const attempt = serial.then(async () => {
        const decoded = Schema.decodeUnknownSync(attachmentSchema)(input, {
          onExcessProperty: 'error',
        });
        const { request, claims, targetId, revision, online, baseline } =
          decoded;
        const definition = await makeNodeDefinition(request, claims, targetId);
        if (
          (await nodeKey(definition.identity)) !== key ||
          (online && baseline === null)
        ) {
          throw makeZerospinError({
            code: 'node-attachment-identity-mismatch',
          });
        }
        await locked.promise;
        const started = generation;
        const check = async () => {
          await sessionDiscovery.check(key, revision, !online);
          if (started !== generation) {
            throw makeZerospinError({ code: 'node-authentication-cancelled' });
          }
        };
        await check();
        let created = false;
        if (owner === undefined) {
          const storage = await openNodeStorage({
            namespace: name,
            sqliteWasmUrl,
            create: online,
          });
          try {
            const node = new Node(storage.db, definition);
            created = await node.initialize(online);
            const authentication = new NodeAuthentication(
              definition.identity,
              async (admission, signal) => {
                try {
                  await sessionDiscovery.check(key, activeRevision, true);
                  const snapshot = await nodeNetwork(
                    request,
                    admission,
                  ).snapshot((await node.snapshot()).metadata.nodeId);
                  if (signal.aborted) {
                    throw makeZerospinError({
                      code: 'node-authentication-cancelled',
                    });
                  }
                  const verified = await makeNodeDefinition(
                    request,
                    snapshot.claims,
                    'aggregateId' in snapshot
                      ? snapshot.aggregateId
                      : snapshot.serviceName,
                  );
                  return {
                    status: 'verified',
                    value: {
                      admission,
                      identity: verified.identity,
                      snapshot: makeNodeRecovery(snapshot),
                    },
                  };
                } catch (error) {
                  return {
                    status: isNodeNetworkUnavailable(error)
                      ? 'unavailable'
                      : 'rejected',
                  };
                }
              },
            );
            owner = {
              node,
              authentication,
              synchronization: new NodeSynchronization(
                node,
                request,
                authentication,
              ),
              close: storage.close,
            };
          } catch (error) {
            await storage.close();
            throw error;
          }
        }
        const current = owner;
        const target = {};
        let unregister = () => {};
        let attached = false;
        let detached = false;
        const detach = () => {
          if (detached) return;
          detached = true;
          unregister();
          attachments.delete(target);
          if (attachments.size === 0) current.synchronization.stop();
        };
        try {
          await check();
          // Old attachments stay revoked after logout, even if another tab signs back in.
          unregister = current.authentication.register(target, async () => {
            if (started !== generation) {
              throw makeZerospinError({ code: 'node-signed-out' });
            }
            return getAdmission();
          });
          attachments.set(target, detach);
          if (online) {
            await current.authentication.resume(definition.identity);
            await current.node.authenticated(
              definition.identity,
              () => started === generation,
            );
            if (created && baseline !== null) {
              await current.node.beginRecovery(baseline);
            }
            await check();
          } else {
            await current.authentication.resume(definition.identity);
          }
          activeRevision = revision;
          await check();
          current.synchronization.enable();
          if (online) {
            const admitted = {
              admission: await getAdmission(),
              identity: definition.identity,
              ...(created && baseline !== null ? { snapshot: baseline } : {}),
            };
            await check();
            const synchronization = current.synchronization.resume(admitted);
            if (!created) await synchronization;
            else void synchronization.catch(() => undefined);
          } else {
            void current.synchronization.resume().catch(() => undefined);
          }
          await check();
          if (online) {
            await sessionDiscovery.update(
              request,
              claims,
              targetId,
              revision,
              true,
            );
          }
          await check();
          const api = new BrowserSessionApi(
            current.node,
            current.synchronization,
            async () => {
              generation += 1;
              for (const detach of attachments.values()) detach();
              current.synchronization.stop();
              await sessionDiscovery.update(
                request,
                claims,
                targetId,
                revision,
                false,
              );
              await current.node.clearAuthentication();
            },
            detach,
          );
          api.isCurrent = () => started === generation;
          attached = true;
          return api;
        } finally {
          if (!attached) {
            detach();
            if (attachments.size === 0) {
              owner = undefined;
              await current.close();
            }
          }
        }
      });
      serial = attempt.catch(() => undefined);
      return attempt;
    },
  };
  const connect = (event: Event) => {
    if (!(event instanceof MessageEvent)) return;
    const port = event.ports[0];
    if (port === undefined) return;
    const api = new SharedWorkerApi(runtime);
    const session = newMessagePortRpcSession(port, api);
    session.onRpcBroken(() => {
      api[Symbol.dispose]();
      port.close();
    });
    port.start();
  };
  globalThis.addEventListener('connect', connect);
  return async () => {
    globalThis.removeEventListener('connect', connect);
    generation += 1;
    owner?.synchronization.stop();
    await serial;
    await owner?.close();
    release.resolve();
  };
}
