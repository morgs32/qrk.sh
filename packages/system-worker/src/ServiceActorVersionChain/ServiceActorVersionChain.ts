import { RoutePattern } from '@remix-run/route-pattern';
import { filterServiceActorCommand } from '@zerospin/core/serviceSession/filterServiceActorCommand';
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

import { getActorCommands } from './getActorCommands/getActorCommands.js';
import { onConnect } from './onConnect/onConnect.js';
import { onMessage } from './onMessage/onMessage.js';
import { receiveActorCommands } from './receiveActorCommands/receiveActorCommands.js';
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

  readonly #actorCommandsSubscriber = makeOutboxSubscriber({
    name: 'actorCommands',
    receive: (rows: Parameters<typeof receiveActorCommands>[0]['rows']) =>
      receiveActorCommands({
        rows,
        db: this.db,
        broadcast: command => {
          for (const connection of this.getConnections<{
            phase: 'awaiting-resume' | 'replaying' | 'live';
            serviceName: string;
            serviceVersion: string;
            actorPath: string;
            claims: Readonly<Record<string, unknown>>;
            sessionName: string;
            serviceSessionLock: IServiceSessionLock;
          }>()) {
            if (connection.state?.phase === 'replaying') {
              connection.close(1012, 'service-session-command-replay-raced');
              continue;
            }
            if (connection.state?.phase !== 'live') continue;
            try {
              connection.send(
                JSON.stringify({
                  type: 'serviceActorCommand',
                  command: filterServiceActorCommand(
                    command,
                    connection.state.serviceSessionLock.models,
                  ),
                }),
              );
            } catch {
              connection.close(1011, 'service-session-command-send-failed');
            }
          }
        },
      }),
  });
  /*
   * Exposes the already bound actorCommandsSubscriber capability from ServiceActorVersionChain.
   *
   * 1. Return the bound capability.
   */
  get actorCommandsSubscriber() {
    // 1 — reuse the existing private queue/subscriber instance
    return this.#actorCommandsSubscriber;
  }

  /*
   * Session reconnects and snapshot publication checks read the retained FSC
   * log. This reader returns a bounded, validated contiguous suffix plus the
   * current publication tip.
   *
   * 1. Run the bound domain operation.
   */
  async getActorCommands(props: { afterServiceIndex: number }) {
    const { afterServiceIndex } = props;

    // 1 — run getActorCommands with the instance-bound dependencies and encode its RPC outcome
    return config.system.runtime.runPromise(
      getActorCommands({
        afterServiceIndex,
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
        Effect.catch(() =>
          Effect.sync(() =>
            connection.close(1011, 'service-session-command-replay-failed'),
          ),
        ),
      ),
    );
  }
}
