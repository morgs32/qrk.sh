import { RoutePattern } from '@remix-run/route-pattern';
import type { IEncodedCommand } from '@zerospin/core/contracts/types';
import type { AggregateFrontendLockSchema } from '@zerospin/core/frontendController/makeAggregateFrontendLock';
import type { IAggregateFrontendFinalizedCommand } from '@zerospin/core/session/types';
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

import { aggregateFrontendFinalizedCommandChainDbConfig } from './AggregateFrontendFinalizedCommandChainDbConfig.js';
import { getCommands } from './getCommands/getCommands.js';
import { onConnect } from './onConnect/onConnect.js';
import { onMessage } from './onMessage/onMessage.js';
import { publishCommand } from './publishCommand/publishCommand.js';

const aggregateFrontendFinalizedCommandChainFixedDORepoConfig =
  makeFixedDORepoConfig({
    abbreviation:
      systemWorkerAbbreviations.aggregateFrontendFinalizedCommandChain,
    repoType: 'AggregateFrontendFinalizedCommandChain',
    namePattern: RoutePattern.parse(
      '/:systemId/:aggregateId/:aggregateName/:userId/:frontendName',
    ),
    managedRuntime,
    getDbConfig: Effect.fn(
      'AggregateFrontendFinalizedCommandChain.getDbConfig',
    )(function* () {
      yield* Effect.void;
      return aggregateFrontendFinalizedCommandChainDbConfig;
    }),
  });

export class AggregateFrontendFinalizedCommandChain extends makeFixedDORepo({
  baseClass: Server,
  fixedDORepoConfig: aggregateFrontendFinalizedCommandChainFixedDORepoConfig,
}) {
  static options = { hibernate: true };

  declare readonly getConnections: Server['getConnections'];

  static override readonly fixedDORepoConfig =
    aggregateFrontendFinalizedCommandChainFixedDORepoConfig;

  async publishCommand(props: {
    command: IEncodedCommand<IAggregateFrontendFinalizedCommand>;
  }): Promise<IEncodedResult<void, IAnyErrorJson>> {
    return managedRuntime.runPromise(
      publishCommand({
        command: props.command,
        db: this.db,
        key: this.key,
        broadcast: async command => {
          for (const connection of this.getConnections<{
            phase: 'awaiting-resume' | 'replaying' | 'live';
            aggregateId: string;
            aggregateName: string;
            userId: string;
            frontendName: string;
            aggregateFrontendLock: Schema.Schema.Type<
              typeof AggregateFrontendLockSchema
            >;
          }>()) {
            if (connection.state?.phase === 'replaying') {
              connection.close(1012, 'aggregate-frontend-command-replay-raced');
              continue;
            }
            if (connection.state?.phase !== 'live') continue;
            try {
              connection.send(
                JSON.stringify({
                  type: 'aggregateFrontendCommand',
                  sync: command,
                }),
              );
            } catch {
              connection.close(1011, 'aggregate-frontend-command-send-failed');
            }
          }
        },
      }).pipe(encodeRpc),
    );
  }

  async getCommands(props: { afterFrontendIndex: number }): Promise<
    IEncodedResult<
      Readonly<{
        commands: readonly IEncodedCommand<IAggregateFrontendFinalizedCommand>[];
        tip: number;
      }>,
      IAnyErrorJson
    >
  > {
    return managedRuntime.runPromise(
      getCommands({
        afterFrontendIndex: props.afterFrontendIndex,
        db: this.db,
      }).pipe(encodeRpc),
    );
  }

  async onConnect(
    connection: Connection<{
      phase: 'awaiting-resume' | 'replaying' | 'live';
      aggregateId: string;
      aggregateName: string;
      userId: string;
      frontendName: string;
      aggregateFrontendLock: Schema.Schema.Type<
        typeof AggregateFrontendLockSchema
      >;
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
      aggregateId: string;
      aggregateName: string;
      userId: string;
      frontendName: string;
      aggregateFrontendLock: Schema.Schema.Type<
        typeof AggregateFrontendLockSchema
      >;
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
            connection.close(1011, 'aggregate-frontend-command-replay-failed'),
          ),
        ),
      ),
    );
  }
}
