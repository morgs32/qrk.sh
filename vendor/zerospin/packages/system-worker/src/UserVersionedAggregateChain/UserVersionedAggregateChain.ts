import { RoutePattern } from '@remix-run/route-pattern';
import type { AggregateFrontendLockSchema } from '@zerospin/core/frontendController/makeAggregateFrontendLock';
import type { IAggregateFrontendFinalizedCommand } from '@zerospin/core/session/types';
import { encodeRpc } from '@zerospin/core/utils/encodeRpc';
import type { IAnyErrorJson, IEncodedResult } from '@zerospin/error';
import { Effect, type Schema } from 'effect';
import {
  Server,
  type Connection,
  type ConnectionContext,
  type WSMessage,
} from 'partyserver';

import { makeFixedDORepo } from '../makeFixedDORepo/makeFixedDORepo.js';
import { makeFixedDORepoConfig } from '../makeFixedDORepo/makeFixedDORepoConfig.js';
import { makeOutboxSubscriber } from '../makeOutboxSubscriber/makeOutboxSubscriber.js';
import { managedRuntime } from '../managedRuntime.js';
import { systemWorkerAbbreviations } from '../systemWorkerAbbreviations.js';

import { getCommands } from './getCommands/getCommands.js';
import { onConnect } from './onConnect/onConnect.js';
import { onMessage } from './onMessage/onMessage.js';
import { receiveDeltas } from './receiveDeltas/receiveDeltas.js';
import { userVersionedAggregateChainDbConfig } from './userVersionedAggregateChainDbConfig.js';

const userVersionedAggregateChainFixedDORepoConfig = makeFixedDORepoConfig({
  abbreviation: systemWorkerAbbreviations.userVersionedAggregateChain,
  repoType: 'UserVersionedAggregateChain',
  namePattern: RoutePattern.parse(
    '/:systemId/:aggregateId/:aggregateName/:aggregateVersion/:userId',
  ),
  managedRuntime,
  dbConfig: userVersionedAggregateChainDbConfig,
});

export class UserVersionedAggregateChain extends makeFixedDORepo({
  namespaceBinding: 'USER_VERSIONED_AGGREGATE_CHAIN',
  baseClass: Server,
  fixedDORepoConfig: userVersionedAggregateChainFixedDORepoConfig,
}) {
  static options = { hibernate: true };

  declare readonly getConnections: Server['getConnections'];

  static override readonly fixedDORepoConfig =
    userVersionedAggregateChainFixedDORepoConfig;

  readonly #deltasSubscriber = makeOutboxSubscriber({
    name: 'deltas',
    receive: (rows: Parameters<typeof receiveDeltas>[0]['rows']) =>
      receiveDeltas({
        rows,
        db: this.db,
        key: this.key,
        broadcast: command => {
          for (const connection of this.getConnections<{
            phase: 'awaiting-resume' | 'replaying' | 'live';
            aggregateId: string;
            aggregateName: string;
            aggregateVersion: string;
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
            const state = connection.state;
            if (state?.phase !== 'live') continue;
            try {
              connection.send(
                JSON.stringify({
                  type: 'aggregateFrontendCommand',
                  sync: {
                    ...command,
                    delta: {
                      ...command.delta,
                      inserted: command.delta.inserted.filter(resource =>
                        Object.hasOwn(
                          state.aggregateFrontendLock.models,
                          resource.modelName,
                        ),
                      ),
                      updated: command.delta.updated.filter(resource =>
                        Object.hasOwn(
                          state.aggregateFrontendLock.models,
                          resource.modelName,
                        ),
                      ),
                      deleted: command.delta.deleted.filter(resource =>
                        Object.hasOwn(
                          state.aggregateFrontendLock.models,
                          resource.modelName,
                        ),
                      ),
                      mutations: command.delta.mutations.filter(mutation =>
                        Object.hasOwn(
                          state.aggregateFrontendLock.models,
                          mutation.modelName,
                        ),
                      ),
                    },
                    resolution:
                      command.resolution?.command.frontendName ===
                      state.frontendName
                        ? command.resolution
                        : null,
                  },
                }),
              );
            } catch {
              connection.close(1011, 'aggregate-frontend-command-send-failed');
            }
          }
        },
      }),
  });
  /*
   * Exposes the already bound deltasSubscriber capability from UserVersionedAggregateChain.
   *
   * 1. Return the bound capability.
   */
  get deltasSubscriber() {
    // 1 — reuse the existing private queue/subscriber instance
    return this.#deltasSubscriber;
  }

  /*
   * Frontend reconnects and snapshot publication checks read the retained UVAC
   * log. This reader returns a bounded, validated contiguous suffix plus the
   * current publication tip.
   *
   * 1. Run the bound domain operation.
   */
  async getCommands(
    props: Omit<Parameters<typeof getCommands>[0], 'db'>,
  ): Promise<
    IEncodedResult<
      Readonly<{
        commands: readonly IAggregateFrontendFinalizedCommand[];
        tip: number;
      }>,
      IAnyErrorJson
    >
  > {
    // 1 — run getCommands with the instance-bound dependencies and encode its RPC outcome
    return managedRuntime.runPromise(
      getCommands({
        ...props,
        db: this.db,
      }).pipe(encodeRpc),
    );
  }

  /*
   * The aggregate frontend log accepts SystemRepo-forwarded upgrade context.
   * It compares the forwarded target with its bound key and initializes a
   * connection awaiting the client resume cursor.
   *
   * 1. Run the bound domain operation.
   */
  async onConnect(
    connection: Connection<{
      phase: 'awaiting-resume' | 'replaying' | 'live';
      aggregateId: string;
      aggregateName: string;
      aggregateVersion: string;
      userId: string;
      frontendName: string;
      aggregateFrontendLock: Schema.Schema.Type<
        typeof AggregateFrontendLockSchema
      >;
    }>,
    context: ConnectionContext,
  ): Promise<void> {
    // 1 — run onConnect with the instance-bound dependencies
    return managedRuntime.runPromise(
      onConnect({ connection, request: context.request, key: this.key }),
    );
  }

  /*
   * The aggregate frontend log handles the one initial resume message by
   * replaying its retained suffix before marking the connection live. Invalid
   * state or an unavailable cursor requests a fresh snapshot and closes the socket.
   *
   * 1. Run the bound domain operation.
   */
  async onMessage(
    connection: Connection<{
      phase: 'awaiting-resume' | 'replaying' | 'live';
      aggregateId: string;
      aggregateName: string;
      aggregateVersion: string;
      userId: string;
      frontendName: string;
      aggregateFrontendLock: Schema.Schema.Type<
        typeof AggregateFrontendLockSchema
      >;
    }>,
    message: WSMessage,
  ): Promise<void> {
    // 1 — run onMessage with the instance-bound dependencies
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
