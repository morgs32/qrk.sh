import { AggregateNode } from '@zerospin/core/AggregateNode/AggregateNode';
import { sessionKey } from '@zerospin/core/Node/sessionKey';
import { makeZerospinError } from '@zerospin/error';
import { newMessagePortRpcSession } from 'capnweb';
import { Schema } from 'effect';

import { isNodeNetworkUnavailable } from '../Node/isNodeNetworkUnavailable.ts';
import { openNodeStorage } from '../Node/openNodeStorage.ts';
import { publicRpcError } from '../Node/publicRpcError.ts';
import { sharedWorkerVersion } from '../sharedWorkerVersion.ts';

import { AggregateBrowserSessionApi } from './AggregateBrowserSessionApi.ts';
import {
  AggregateNodeAuthentication,
  type IVerifiedAggregateAdmission,
} from './AggregateNodeAuthentication.ts';
import { aggregateNodeNetwork } from './aggregateNodeNetwork.ts';
import { AggregateNodeRequestSchema } from './aggregateNodeRequest.ts';
import { AggregateNodeSynchronization } from './AggregateNodeSynchronization.ts';
import { aggregateSessionDiscovery } from './aggregateSessionDiscovery.ts';
import { AggregateSharedWorkerApi } from './AggregateSharedWorkerApi.ts';
import { makeAggregateNodeBaseline } from './makeAggregateNodeBaseline.ts';
import { makeAggregateNodeDefinition } from './makeAggregateNodeDefinition.ts';
const attachmentSchema = Schema.Struct({
  request: AggregateNodeRequestSchema,
  claims: Schema.Record(Schema.String, Schema.Unknown),
  aggregateId: Schema.String,
  revision: Schema.Number.check(
    Schema.isInt(),
    Schema.isGreaterThanOrEqualTo(0),
  ),
  online: Schema.Boolean,
});
/** One named worker owns one durable node; each port owns only its attached session. */
export function makeAggregateSharedWorker({
  sqliteWasmUrl,
  name,
  sessionKey: key,
}: {
  sqliteWasmUrl: string;
  name: string;
  sessionKey: string;
}) {
  let owner:
    | {
        node: AggregateNode;
        authentication: AggregateNodeAuthentication;
        synchronization: AggregateNodeSynchronization;
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
  const runtime: ConstructorParameters<typeof AggregateSharedWorkerApi>[0] = {
    async ready() {
      await locked.promise;
      return { version: sharedWorkerVersion };
    },
    attach(input, getAdmission) {
      const attempt = serial.then(async () => {
        const decoded = Schema.decodeUnknownSync(attachmentSchema)(input, {
          onExcessProperty: 'error',
        });
        const { request, claims, aggregateId, revision, online } = decoded;
        const definition = await makeAggregateNodeDefinition(
          request,
          claims,
          aggregateId,
        );
        if ((await sessionKey(definition.identity)) !== key) {
          throw makeZerospinError({
            code: 'node-attachment-identity-mismatch',
          });
        }
        await locked.promise;
        const started = generation;
        const check = async () => {
          await aggregateSessionDiscovery.check(key, revision, !online);
          if (started !== generation) {
            throw makeZerospinError({ code: 'node-authentication-cancelled' });
          }
        };
        await check();

        if (owner === undefined) {
          const storage = await openNodeStorage({
            namespace: name,
            sqliteWasmUrl,
            create: online,
          });
          try {
            const node = new AggregateNode(storage.db, definition);
            await node.initialize(online);
            const authentication = new AggregateNodeAuthentication(
              definition.identity,
              async (admission, signal) => {
                try {
                  await aggregateSessionDiscovery.check(
                    key,
                    activeRevision,
                    false,
                  );
                  const snapshot = await aggregateNodeNetwork(
                    request,
                    admission,
                  ).snapshot((await node.snapshot()).metadata.nodeId);
                  if (signal.aborted) {
                    throw makeZerospinError({
                      code: 'node-authentication-cancelled',
                    });
                  }
                  const verified = await makeAggregateNodeDefinition(
                    request,
                    snapshot.claims,
                    snapshot.aggregateId,
                  );
                  return {
                    status: 'verified',
                    value: {
                      admission,
                      identity: verified.identity,
                      snapshot: makeAggregateNodeBaseline(snapshot),
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
              synchronization: new AggregateNodeSynchronization(
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
        const attachment = {};
        let unregister = () => {};
        let attached = false;
        let detached = false;
        const detach = () => {
          if (detached) return;
          detached = true;
          unregister();
          attachments.delete(attachment);
          if (attachments.size === 0) current.synchronization.stop();
        };
        try {
          await check();
          // Old attachments stay revoked after logout, even if another tab signs back in.
          unregister = current.authentication.register(attachment, async () => {
            if (started !== generation) {
              throw makeZerospinError({ code: 'node-signed-out' });
            }
            return getAdmission();
          });
          attachments.set(attachment, detach);
          activeRevision = revision;
          let verified: IVerifiedAggregateAdmission | undefined;
          if (online) {
            await current.authentication.resume(definition.identity);
            verified = await current.authentication.authenticate();
            await check();
            await current.node.authenticated(
              verified.identity,
              () => started === generation,
            );
            if (!(await current.node.snapshot()).metadata.initialized) {
              if (verified.snapshot === undefined) {
                throw makeZerospinError({ code: 'node-baseline-missing' });
              }
              await current.node.initializeBaseline(verified.snapshot);
            }
            await check();
          } else {
            await current.authentication.resume(definition.identity);
          }
          await check();
          current.synchronization.enable();
          if (online && !current.node.status().blockedWork) {
            await check();
            await current.synchronization.resume(verified);
          } else if (!online) {
            void current.synchronization.resume().catch(() => undefined);
          }
          await check();
          if (online) {
            await aggregateSessionDiscovery.update(
              request,
              claims,
              aggregateId,
              revision,
              true,
            );
          }
          await check();
          const api = new AggregateBrowserSessionApi(
            current.node,
            current.synchronization,
            async () => {
              generation += 1;
              for (const detach of attachments.values()) detach();
              current.synchronization.stop();
              await aggregateSessionDiscovery.update(
                request,
                claims,
                aggregateId,
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
    const api = new AggregateSharedWorkerApi(runtime);
    const session = newMessagePortRpcSession(port, api, {
      onSendError: publicRpcError,
    });
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
