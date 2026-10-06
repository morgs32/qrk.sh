import { RoutePattern } from '@remix-run/route-pattern';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { filterServiceBrowserCommand } from '@zerospin/core/serviceSession/filterServiceBrowserCommand';
import type { IServiceSessionLock } from '@zerospin/core/serviceSession/ServiceSessionLockSchema';
import { makeZerospinError } from '@zerospin/error';
import { makeRpcEnvelope } from '@zerospin/logger';
import config from 'config';
import { Effect } from 'effect';
import {
  Server,
  type Connection,
  type ConnectionContext,
  type WSMessage,
} from 'partyserver';

import { makeFixedDORepo } from '../makeFixedDORepo/makeFixedDORepo.js';
import { makeFixedDORepoConfig } from '../makeFixedDORepo/makeFixedDORepoConfig.js';
import { makeOutboxSubscriber } from '../makeOutboxSubscriber/makeOutboxSubscriber.js';
import { resolveServiceActorView } from '../ServiceActorVersionRepo/resolveServiceActorView.js';
import { systemWorkerAbbreviations } from '../systemWorkerAbbreviations.js';

import { getBrowserCommands } from './getBrowserCommands/getBrowserCommands.js';
import { getNodeOutcomes } from './getNodeOutcomes.js';
import { onConnect } from './onConnect/onConnect.js';
import { onMessage } from './onMessage/onMessage.js';
import { receiveBrowserCommands } from './receiveBrowserCommands/receiveBrowserCommands.js';
import { serviceActorVersionChainDbConfig } from './serviceActorVersionChainDbConfig.js';

const serviceActorVersionChainFixedDORepoConfig = makeFixedDORepoConfig({
  abbreviation: systemWorkerAbbreviations.serviceActorVersionChain,
  repoType: 'ServiceActorVersionChain',
  namePattern: RoutePattern.parse(
    '/:systemId/:serviceName/:serviceVersion/:actorName/:actorVersion/:actorPath',
  ),
  managedRuntime: config.system.runtime,
  dbConfig: Effect.fn('ServiceActorVersionChain.dbConfig')(function* ({ key }) {
    const owner = config.system.services[key.serviceName]?.[key.serviceVersion];
    if (owner === undefined) {
      return yield* Effect.fail(
        makeZerospinError({ code: 'selection-owner-unavailable' }),
      );
    }
    yield* resolveServiceActorView(owner, key);
    return serviceActorVersionChainDbConfig;
  }),
});

export class ServiceActorVersionChain extends makeFixedDORepo({
  namespaceBinding: 'SERVICE_ACTOR_VERSION_CHAIN',
  baseClass: Server,
  fixedDORepoConfig: serviceActorVersionChainFixedDORepoConfig,
}) {
  static options = { hibernate: true };

  declare readonly getConnections: Server['getConnections'];

  static override readonly fixedDORepoConfig =
    serviceActorVersionChainFixedDORepoConfig;

  readonly #browserCommandSubscriber = makeOutboxSubscriber({
    name: 'browserCommand',
    receive: (rows: Parameters<typeof receiveBrowserCommands>[0]['rows']) =>
      receiveBrowserCommands({
        rows,
        db: this.db,
        broadcast: (output, owner) => {
          for (const connection of this.getConnections<{
            phase: 'awaiting-resume' | 'replaying' | 'live';
            nodeId?: string | null;
            serviceName: string;
            serviceVersion: string;
            actorPath: string;
            claims: Readonly<Record<string, unknown>>;
            sessionName: string;
            serviceSessionLock: IServiceSessionLock;
          }>()) {
            if (connection.state?.phase === 'replaying') {
              connection.close(1012, 'service-session-output-replay-raced');
              continue;
            }
            if (connection.state?.phase !== 'live') {
              continue;
            }
            try {
              connection.send(
                JSON.stringify(
                  filterServiceBrowserCommand(
                    output,
                    connection.state.serviceSessionLock.models,
                    connection.state,
                    owner,
                  ),
                ),
              );
            } catch {
              connection.close(1011, 'service-session-output-send-failed');
            }
          }
        },
      }),
  });
  /*
   * Exposes the already bound browserCommandSubscriber capability from ServiceActorVersionChain.
   *
   * 1. Return the bound capability.
   */
  get browserCommandSubscriber() {
    // 1 — reuse the existing private queue/subscriber instance
    return this.#browserCommandSubscriber;
  }

  /*
   * Session reconnects and snapshot publication checks read the retained FSC
   * log. This reader returns a bounded, validated contiguous suffix plus the
   * current publication tip.
   *
   * 1. Run the bound domain operation.
   */
  async getNodeOutcomes(
    props: Omit<Parameters<typeof getNodeOutcomes>[0], 'db'>,
  ) {
    return config.system.runtime.runPromise(
      getNodeOutcomes({ ...props, db: this.db }).pipe(makeRpcEnvelope),
    );
  }

  async getBrowserCommands(props: { afterExecutedIndex: number }) {
    const { afterExecutedIndex } = props;

    // 1 — run getBrowserCommands with the instance-bound dependencies and encode its RPC outcome
    return config.system.runtime.runPromise(
      getBrowserCommands({
        afterExecutedIndex,
        db: this.db,
      }).pipe(makeRpcEnvelope),
    );
  }

  /*
   * The service definition log accepts SystemRepo-forwarded upgrade context.
   * It compares the forwarded target with its bound key and initializes a
   * connection awaiting the client resume cursor.
   *
   * 1. Run the bound domain operation.
   */
  async onConnect(
    connection: Connection<{
      phase: 'awaiting-resume' | 'replaying' | 'live';
      nodeId?: string | null;
      serviceName: string;
      serviceVersion: string;
      actorPath: string;
      claims: Readonly<Record<string, unknown>>;
      sessionName: string;
      serviceSessionLock: IServiceSessionLock;
    }>,
    context: ConnectionContext,
  ): Promise<void> {
    // 1 — run onConnect with the instance-bound dependencies
    return config.system.runtime.runPromise(
      onConnect({ connection, request: context.request, key: this.key }),
    );
  }

  /*
   * The service definition log handles the one initial resume message by
   * replaying its retained suffix before marking the connection live. Invalid
   * state or an unavailable cursor requests a fresh snapshot and closes the socket.
   *
   * 1. Run the bound domain operation.
   */
  async onMessage(
    connection: Connection<{
      phase: 'awaiting-resume' | 'replaying' | 'live';
      nodeId?: string | null;
      serviceName: string;
      serviceVersion: string;
      actorPath: string;
      claims: Readonly<Record<string, unknown>>;
      sessionName: string;
      serviceSessionLock: IServiceSessionLock;
    }>,
    message: WSMessage,
  ): Promise<void> {
    // 1 — run onMessage with the instance-bound dependencies
    return config.system.runtime.runPromise(
      onMessage({
        connection,
        message,
        db: this.db,
        key: this.key,
      }).pipe(
        Effect.provide(AsyncLive),
        Effect.catch(() =>
          Effect.sync(() =>
            connection.close(1011, 'service-session-command-replay-failed'),
          ),
        ),
      ),
    );
  }
}
