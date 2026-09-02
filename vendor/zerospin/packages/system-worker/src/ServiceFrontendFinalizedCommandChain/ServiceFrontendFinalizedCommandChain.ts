import { RoutePattern } from '@remix-run/route-pattern';
import type { IEncodedCommand } from '@zerospin/core/contracts/types';
import type { ServiceFrontendLockSchema } from '@zerospin/core/frontendController/makeServiceFrontendLock';
import type { IServiceFrontendFinalizedCommand } from '@zerospin/core/serviceSession/types';
import { encodeRpc } from '@zerospin/core/utils/encodeRpc';
import type { IAnyErrorJson, IEncodedResult } from '@zerospin/error';
import { Effect, Schema } from 'effect';
import {
  Server,
  type Connection,
  type ConnectionContext,
  type WSMessage,
} from 'partyserver';

import { makeFixedDORepo } from '../makeFixedDORepo/makeFixedDORepo.js';
import { makeFixedDORepoConfig } from '../makeFixedDORepo/makeFixedDORepoConfig.js';
import { managedRuntime } from '../managedRuntime.js';
import { systemWorkerAbbreviations } from '../systemWorkerAbbreviations.js';

import { getCommands } from './getCommands/getCommands.js';
import { onConnect } from './onConnect/onConnect.js';
import { onMessage } from './onMessage/onMessage.js';
import { publishCommand } from './publishCommand/publishCommand.js';
import { serviceFrontendFinalizedCommandChainDbConfig } from './ServiceFrontendFinalizedCommandChainDbConfig.js';

const serviceFrontendFinalizedCommandChainFixedDORepoConfig =
  makeFixedDORepoConfig({
    abbreviation:
      systemWorkerAbbreviations.serviceFrontendFinalizedCommandChain,
    repoType: 'ServiceFrontendFinalizedCommandChain',
    namePattern: RoutePattern.parse(
      '/:systemId/:serviceName/:userId/:frontendName',
    ),
    managedRuntime,
    getDbConfig: Effect.fn('ServiceFrontendFinalizedCommandChain.getDbConfig')(
      function* () {
        yield* Effect.void;
        return serviceFrontendFinalizedCommandChainDbConfig;
      },
    ),
  });

export class ServiceFrontendFinalizedCommandChain extends makeFixedDORepo({
  baseClass: Server,
  fixedDORepoConfig: serviceFrontendFinalizedCommandChainFixedDORepoConfig,
}) {
  static options = { hibernate: true };

  declare readonly getConnections: Server['getConnections'];

  static override readonly fixedDORepoConfig =
    serviceFrontendFinalizedCommandChainFixedDORepoConfig;

  async publishCommand(props: {
    command: IEncodedCommand<IServiceFrontendFinalizedCommand>;
  }): Promise<IEncodedResult<void, IAnyErrorJson>> {
    return managedRuntime.runPromise(
      publishCommand({
        command: props.command,
        db: this.db,
        key: this.key,
        broadcast: async command => {
          for (const connection of this.getConnections<{
            phase: 'awaiting-resume' | 'replaying' | 'live';
            serviceName: string;
            userId: string;
            frontendName: string;
            serviceFrontendLock: Schema.Schema.Type<
              typeof ServiceFrontendLockSchema
            >;
          }>()) {
            if (connection.state?.phase === 'replaying') {
              connection.close(1012, 'service-frontend-command-replay-raced');
              continue;
            }
            if (connection.state?.phase !== 'live') continue;
            try {
              connection.send(
                JSON.stringify({
                  type: 'serviceFrontendCommand',
                  sync: command,
                }),
              );
            } catch {
              connection.close(1011, 'service-frontend-command-send-failed');
            }
          }
        },
      }).pipe(encodeRpc),
    );
  }

  async getCommands(props: { afterServiceFrontendIndex: number }): Promise<
    IEncodedResult<
      Readonly<{
        commands: readonly IEncodedCommand<IServiceFrontendFinalizedCommand>[];
        tip: number;
      }>,
      IAnyErrorJson
    >
  > {
    return managedRuntime.runPromise(
      getCommands({
        afterServiceFrontendIndex: props.afterServiceFrontendIndex,
        db: this.db,
      }).pipe(encodeRpc),
    );
  }

  async onConnect(
    connection: Connection<{
      phase: 'awaiting-resume' | 'replaying' | 'live';
      serviceName: string;
      userId: string;
      frontendName: string;
      serviceFrontendLock: Schema.Schema.Type<typeof ServiceFrontendLockSchema>;
    }>,
    context: ConnectionContext,
  ): Promise<void> {
    return managedRuntime.runPromise(
      onConnect({ connection, request: context.request, key: this.key }),
    );
  }

  async onMessage(
    connection: Connection<{
      phase: 'awaiting-resume' | 'replaying' | 'live';
      serviceName: string;
      userId: string;
      frontendName: string;
      serviceFrontendLock: Schema.Schema.Type<typeof ServiceFrontendLockSchema>;
    }>,
    message: WSMessage,
  ): Promise<void> {
    return managedRuntime.runPromise(
      onMessage({
        connection,
        message,
        db: this.db,
        key: this.key,
      }).pipe(
        Effect.catch(() =>
          Effect.sync(() =>
            connection.close(1011, 'service-frontend-command-replay-failed'),
          ),
        ),
      ),
    );
  }
}
