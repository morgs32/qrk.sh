import { assertSessionIdentity } from '@zerospin/core/identity/assertSessionIdentity';
import type { IAdmissionRequest } from '@zerospin/core/identity/types';
import { makeZerospinError } from '@zerospin/error';
import type { SqliteRemoteDatabase } from 'drizzle-orm/sqlite-proxy';
import { Schema } from 'effect';

import { isNodeNetworkUnavailable } from './isNodeNetworkUnavailable.ts';
import { Node } from './Node.ts';
import { NodeAuthentication } from './NodeAuthentication.ts';
import { type NodeCatalog } from './NodeCatalog.ts';
import { hashNodeValue, nodeKey } from './nodeKey.ts';
import { nodeNetwork } from './nodeNetwork.ts';
import { NodeRequestSchema, type INodeRequest } from './nodeRequest.ts';
import { NodeSynchronization } from './NodeSynchronization.ts';
import type { INodeDefinition, INodeIdentity } from './types.ts';

type IHostedNode = {
  node: Node;
  authentication: NodeAuthentication;
  synchronization: NodeSynchronization;
};

export class NodeHost {
  private readonly nodes = new Map<string, Promise<IHostedNode>>();
  private readonly responders = new Map<
    object,
    {
      request: INodeRequest;
      getAdmission(): Promise<IAdmissionRequest>;
      unregister: (() => void)[];
    }
  >();
  private generation = 0;
  private readonly observations = new Set<string>();

  constructor(
    readonly catalog: NodeCatalog,
    readonly open: (key: string) => Promise<SqliteRemoteDatabase>,
  ) {}

  private async identity(
    request: INodeRequest,
    identity: INodeIdentity['identity'],
    targetId: string,
  ): Promise<INodeIdentity> {
    const { lock, ...configuration } = request;
    return {
      ...configuration,
      actorName: lock.actorName,
      actorVersion: lock.actorVersion,
      targetId,
      identity,
      definitionHash: await hashNodeValue(lock),
    };
  }

  private sameSession(left: INodeRequest, right: INodeRequest) {
    return (
      left.apiUrl === right.apiUrl &&
      left.publishableKey === right.publishableKey &&
      left.systemName === right.systemName &&
      left.kind === right.kind &&
      left.targetName === right.targetName &&
      left.sessionName === right.sessionName &&
      left.lock.actorName === right.lock.actorName
    );
  }

  private request(definition: INodeDefinition): INodeRequest {
    return Schema.decodeUnknownSync(NodeRequestSchema)({
      ...definition.identity,
      lock: definition.lock,
    });
  }

  private async hosted(definition: INodeDefinition): Promise<IHostedNode> {
    const key = await nodeKey(definition.identity);
    const current = this.nodes.get(key);
    if (current !== undefined) return current;
    const opening = (async () => {
      const node = new Node(await this.open(key), definition);
      await node.initialize();
      const request = this.request(definition);
      const authentication = new NodeAuthentication(
        definition.identity,
        async (admission, signal) => {
          const generation = this.generation;
          try {
            const snapshot = await nodeNetwork(request, admission).snapshot(
              (await node.snapshot()).metadata.nodeId,
            );
            const identity = await this.identity(
              request,
              snapshot.identity,
              'aggregateId' in snapshot
                ? snapshot.aggregateId
                : snapshot.serviceName,
            );
            if ((await nodeKey(identity)) === key) {
              await this.catalog.authenticated(
                definition,
                () => !signal.aborted && generation === this.generation,
              );
            }
            return { status: 'verified', value: { admission, identity } };
          } catch (error) {
            if (isNodeNetworkUnavailable(error)) {
              return { status: 'unavailable' };
            }
            return { status: 'rejected' };
          }
        },
      );
      const synchronization = new NodeSynchronization(
        node,
        request,
        authentication,
      );
      for (const [target, responder] of this.responders) {
        if (this.sameSession(request, responder.request)) {
          responder.unregister.push(
            authentication.register(target, responder.getAdmission),
          );
        }
      }
      return { node, authentication, synchronization };
    })();
    this.nodes.set(key, opening);
    void opening.catch(() => {
      if (this.nodes.get(key) === opening) this.nodes.delete(key);
    });
    return opening;
  }

  async attach(
    input: unknown,
    target: object,
    getAdmission: () => Promise<IAdmissionRequest>,
    expectedIdentity?: Readonly<Record<string, unknown>>,
  ) {
    const request = Schema.decodeUnknownSync(NodeRequestSchema)(input, {
      onExcessProperty: 'error',
    });
    const generation = this.generation;
    let pending: Promise<IAdmissionRequest> | null = null;
    const admission = () => {
      if (pending !== null) return pending;
      const call = Promise.resolve().then(getAdmission);
      pending = call;
      void call
        .finally(() => {
          if (pending === call) pending = null;
        })
        .catch(() => undefined);
      return call;
    };
    const locator = await this.identity(request, {}, '');
    let definition: INodeDefinition;
    let online = false;
    let acceptedAdmission: IAdmissionRequest | undefined;
    try {
      let timeout: ReturnType<typeof setTimeout> | undefined;
      const requestAdmission = await Promise.race([
        admission(),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(
            () =>
              reject(makeZerospinError({ code: 'node-admission-unavailable' })),
            5000,
          );
        }),
      ]).finally(() => clearTimeout(timeout));
      const snapshot = await nodeNetwork(request, requestAdmission).snapshot(
        null,
      );
      acceptedAdmission = requestAdmission;
      definition = {
        identity: await this.identity(
          request,
          snapshot.identity,
          'aggregateId' in snapshot
            ? snapshot.aggregateId
            : snapshot.serviceName,
        ),
        lock: request.lock,
      };
      assertSessionIdentity(expectedIdentity, definition.identity.identity);
      online = true;
    } catch (error) {
      if (!isNodeNetworkUnavailable(error)) throw error;
      const remembered = await this.catalog.reopenOffline(locator);
      if (remembered === null) throw error;
      assertSessionIdentity(expectedIdentity, remembered.identity.identity);
      definition = remembered;
    }
    if (generation !== this.generation) {
      throw makeZerospinError({ code: 'node-authentication-cancelled' });
    }
    if (online) {
      await this.catalog.authenticated(
        definition,
        () => generation === this.generation,
      );
    }
    const responder: {
      request: INodeRequest;
      getAdmission(): Promise<IAdmissionRequest>;
      unregister: (() => void)[];
    } = { request, getAdmission: admission, unregister: [] };
    this.responders.set(target, responder);
    const assertCurrent = () => {
      if (generation !== this.generation) {
        throw makeZerospinError({ code: 'node-authentication-cancelled' });
      }
    };
    try {
      const hosted = await this.hosted(definition);
      for (const existing of this.nodes.values()) {
        const entry = await existing;
        if (this.sameSession(request, this.request(entry.node.definition))) {
          responder.unregister.push(
            entry.authentication.register(target, admission),
          );
        }
      }
      assertCurrent();
      if (online) {
        await hosted.authentication.resume(definition.identity);
        await hosted.node.authenticated(
          definition.identity,
          () => generation === this.generation,
        );
        assertCurrent();
        hosted.synchronization.enable();
      }
      // The catalog finds retained older definitions after worker restart.
      for (const older of await this.catalog.discover(definition.identity)) {
        const entry = await this.hosted(older);
        if (entry === hosted) continue;
        const observation = `${await nodeKey(definition.identity)}:${await nodeKey(older.identity)}`;
        if (!this.observations.has(observation)) {
          this.observations.add(observation);
          await entry.node.subscribe(async change => {
            const snapshot =
              change.type === 'snapshot'
                ? change.snapshot
                : await entry.node.snapshot();
            const { authentication, synchronization, blockedWork, failure } =
              snapshot.state;
            hosted.node.retainNodeState({
              nodeId: snapshot.metadata.nodeId,
              definitionHash: older.identity.definitionHash,
              unresolvedCommands: snapshot.unresolvedCommands.length,
              authentication,
              synchronization,
              blockedWork,
              failure,
            });
          });
        }
        void (async () => {
          if (online) {
            const oldRequest = this.request(older);
            if (acceptedAdmission === undefined) {
              throw makeZerospinError({ code: 'node-admission-unavailable' });
            }
            const verified = await nodeNetwork(
              oldRequest,
              acceptedAdmission,
            ).snapshot((await entry.node.snapshot()).metadata.nodeId);
            const identity = await this.identity(
              oldRequest,
              verified.identity,
              'aggregateId' in verified
                ? verified.aggregateId
                : verified.serviceName,
            );
            if (generation !== this.generation) return;
            await entry.authentication.resume(identity);
            assertCurrent();
            entry.synchronization.enable();
          }
          await entry.synchronization.resume();
        })().catch(error => entry.node.connectionState('blocked', error));
      }
      // A new node needs an initial resource baseline before an optimistic tab can stage.
      if (
        online &&
        (await hosted.node.snapshot()).metadata.executedIndex === 0
      ) {
        await hosted.synchronization.resume();
      } else {
        void hosted.synchronization.resume().catch(() => undefined);
      }
      assertCurrent();
      return {
        ...hosted,
        detach: () => {
          this.responders.delete(target);
          for (const unregister of responder.unregister) unregister();
        },
        clearAuthentication: async () => {
          this.generation += 1;
          await this.catalog.clearAuthentication(definition.identity);
          for (const existing of this.nodes.values()) {
            const entry = await existing;
            if (
              this.sameSession(request, this.request(entry.node.definition))
            ) {
              entry.synchronization.stop();
              await entry.node.clearAuthentication();
            }
          }
        },
      };
    } catch (error) {
      this.responders.delete(target);
      for (const unregister of responder.unregister) unregister();
      throw error;
    }
  }
}
