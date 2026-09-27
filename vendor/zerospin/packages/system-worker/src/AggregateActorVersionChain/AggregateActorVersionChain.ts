import { RoutePattern } from '@remix-run/route-pattern';
import { createHref } from '@remix-run/route-pattern/href';
import { createMatcher } from '@remix-run/route-pattern/match';
import { resolveAggregateActorVersion } from '@zerospin/core/aggregateActor/getAggregateActorVersion';
import type { IAggregateSessionLock } from '@zerospin/core/aggregateSession/AggregateSessionLockSchema';
import { makeZerospinError, mapParseError } from '@zerospin/error';
import { makeRpcEnvelope } from '@zerospin/logger';
import config from 'config';
import { Effect, Schema } from 'effect';
import { isEqual } from 'es-toolkit';
import {
  Server,
  type Connection,
  type ConnectionContext,
  type WSMessage,
} from 'partyserver';

import { deliverActorCommand } from '../deliverActorCommand/deliverActorCommand.js';
import { makeFixedDORepo } from '../makeFixedDORepo/makeFixedDORepo.js';
import { makeFixedDORepoConfig } from '../makeFixedDORepo/makeFixedDORepoConfig.js';
import { makeOutboxSubscriber } from '../makeOutboxSubscriber/makeOutboxSubscriber.js';
import { systemWorkerAbbreviations } from '../systemWorkerAbbreviations.js';

import { aggregateActorVersionChainDbConfig } from './aggregateActorVersionChainDbConfig.js';
import { getActorCommands } from './getActorCommands/getActorCommands.js';
import { onConnect } from './onConnect/onConnect.js';
import { onMessage } from './onMessage/onMessage.js';
import { receiveActorCommands } from './receiveActorCommands/receiveActorCommands.js';

const aggregateActorVersionChainFixedDORepoConfig = makeFixedDORepoConfig({
  abbreviation: systemWorkerAbbreviations.aggregateActorVersionChain,
  repoType: 'AggregateActorVersionChain',
  namePattern: RoutePattern.parse(
    '/:systemId/:aggregateId/:aggregateName/:aggregateVersion/:actorName/:actorVersion/:actorPath',
  ),
  managedRuntime: config.system.runtime,
  dbConfig: Effect.fn('AggregateActorVersionChain.dbConfig')(
    /*
     * Durable Object construction asks this resolver for the chain's SQLite
     * schema before opening storage. It admits only a listed aggregate owner
     * and a canonical actor path, then returns the shared command log. The
     * check does not choose tables.
     *
     * 1. Require the listed aggregate owner.
     * 2. Resolve the actor version that owner supports.
     * 3. Decode the actor path through the view's identity schema.
     * 4. Reject a noncanonical actor path.
     * 5. Return the shared command-log schema.
     */
    function* ({ key }) {
      // 1 — fail actor-owner-unavailable when system.aggregates has no owner for the key
      const owner =
        config.system.aggregates[key.aggregateName]?.[key.aggregateVersion];
      if (owner === undefined) {
        return yield* Effect.fail(
          makeZerospinError({
            code: 'actor-owner-unavailable',
          }),
        );
      }

      // 2 — resolve the actor view from that single owner version
      const view = yield* resolveAggregateActorVersion(
        { [owner.version]: owner },
        key,
      );

      // 3 — match actorPath, decode the selection, and require encoded string fields
      const matched = yield* Effect.try({
        try: () =>
          createMatcher(view.identity.pattern).match(
            new URL(key.actorPath, 'https://selection.invalid'),
          ),
        catch: () => makeZerospinError({ code: 'actor-path-invalid' }),
      });
      const selection = yield* Schema.decodeUnknownEffect(
        view.identity.actorSchema,
      )(matched?.params, { onExcessProperty: 'error' }).pipe(
        mapParseError({
          code: 'actor-path-invalid',
          prefix: 'Invalid chain selection fields',
        }),
      );
      const encoded = yield* Schema.encodeEffect(view.identity.actorSchema)(
        selection,
      ).pipe(
        mapParseError({
          code: 'actor-path-invalid',
          prefix: 'Invalid chain selection encoding',
        }),
      );
      const strings = yield* Schema.decodeUnknownEffect(
        Schema.Record(Schema.String, Schema.String),
      )(encoded).pipe(
        mapParseError({
          code: 'actor-path-invalid',
          prefix: 'Encoded selection fields must be strings',
        }),
      );

      // 4 — fail actor-path-noncanonical when the rebuilt href differs from actorPath
      if (createHref(view.identity.pattern, strings) !== key.actorPath) {
        return yield* Effect.fail(
          makeZerospinError({
            code: 'actor-path-noncanonical',
          }),
        );
      }

      // 5 — return the static commands table, independent of the actor view
      return aggregateActorVersionChainDbConfig;
    },
  ),
});

export class AggregateActorVersionChain extends makeFixedDORepo({
  namespaceBinding: 'AGGREGATE_ACTOR_VERSION_CHAIN',
  baseClass: Server,
  fixedDORepoConfig: aggregateActorVersionChainFixedDORepoConfig,
}) {
  static options = { hibernate: true };

  declare readonly getConnections: Server['getConnections'];

  static override readonly fixedDORepoConfig =
    aggregateActorVersionChainFixedDORepoConfig;

  readonly #actorCommandsSubscriber = makeOutboxSubscriber({
    name: 'actorCommands',
    receive: (rows: Parameters<typeof receiveActorCommands>[0]['rows']) =>
      receiveActorCommands({
        rows,
        db: this.db,
        broadcast: ({ command, identity, sessionName }) => {
          for (const connection of this.getConnections<{
            phase: 'awaiting-resume' | 'replaying' | 'live';
            nodeId?: string;
            admissionCommandId?: string | null;
            aggregateId: string;
            aggregateName: string;
            aggregateVersion: string;
            actorName: string;
            actorVersion: string;
            actorPath: string;
            identity: Readonly<Record<string, unknown>>;
            sessionName: string;
            aggregateSessionLock: IAggregateSessionLock;
          }>()) {
            if (connection.state?.phase === 'replaying') {
              connection.close(1012, 'aggregate-session-command-replay-raced');
              continue;
            }
            const state = connection.state;
            if (state?.phase !== 'live') continue;
            try {
              const ownsCompletion =
                isEqual(identity, state.identity) &&
                sessionName === state.sessionName &&
                command.nodeId === state.nodeId;
              // Validate the public envelope; JSON sockets carry the original codec bytes.
              const delivered = Effect.runSync(
                deliverActorCommand({
                  ...state,
                  command: {
                    ...command,
                    admission: ownsCompletion ? command.admission : null,
                    execution: ownsCompletion ? command.execution : null,
                  },
                }),
              );
              connection.send(
                JSON.stringify({
                  type: 'aggregateActorCommand',
                  command: {
                    id: command.id,
                    nodeId: ownsCompletion ? command.nodeId : null,
                    nodeIndex: ownsCompletion ? command.nodeIndex : null,
                    aggregateIndex: command.aggregateIndex,
                    executedIndex: command.executedIndex,
                    executedHash: command.executedHash,
                    actorDelta: delivered.actorDelta,
                    admission: delivered.admission,
                    execution: delivered.execution,
                  },
                }),
              );
            } catch {
              connection.close(1011, 'aggregate-session-command-send-failed');
            }
          }
        },
      }),
  });
  /*
   * Exposes the already bound actorCommandsSubscriber capability from AggregateActorVersionChain.
   *
   * 1. Return the bound capability.
   */
  get actorCommandsSubscriber() {
    // 1 — reuse the existing private queue/subscriber instance
    return this.#actorCommandsSubscriber;
  }

  /*
   * Session reconnects and snapshot publication checks read the retained ActorVAC
   * log. This reader returns a bounded ordered union of missing executions and
   * owned results, with independent cursors, plus the current publication tip.
   *
   * 1. Run the bound domain operation.
   */
  async getActorCommands(
    props: Omit<Parameters<typeof getActorCommands>[0], 'db'>,
  ) {
    // 1 — run getActorCommands with the instance-bound dependencies and encode its RPC outcome
    return config.system.runtime.runPromise(
      getActorCommands({
        ...props,
        db: this.db,
      }).pipe(makeRpcEnvelope),
    );
  }

  /*
   * The aggregate definition log accepts SystemRepo-forwarded upgrade context.
   * It checks the lock's actor against its bound key and initializes a
   * connection awaiting the client resume cursor.
   *
   * 1. Run the bound domain operation.
   */
  async onConnect(
    connection: Connection<{
      phase: 'awaiting-resume' | 'replaying' | 'live';
      nodeId?: string;
      admissionCommandId?: string | null;
      aggregateId: string;
      aggregateName: string;
      aggregateVersion: string;
      actorName: string;
      actorVersion: string;
      actorPath: string;
      identity: Readonly<Record<string, unknown>>;
      sessionName: string;
      aggregateSessionLock: IAggregateSessionLock;
    }>,
    context: ConnectionContext,
  ): Promise<void> {
    // 1 — run onConnect with the instance-bound dependencies
    return config.system.runtime.runPromise(
      onConnect({ connection, request: context.request, key: this.key }),
    );
  }

  /*
   * The aggregate definition log admits unchanged commands only on its validated live
   * socket and returns linked admission receipts alongside selected delivery.
   * It handles the initial resume message by replaying missing executions and
   * owned results in one ordered stream before marking the connection live.
   * Invalid state or an unavailable cursor requests a fresh snapshot and closes
   * the socket.
   *
   * 1. Run the bound domain operation.
   */
  async onMessage(
    connection: Connection<{
      phase: 'awaiting-resume' | 'replaying' | 'live';
      nodeId?: string;
      admissionCommandId?: string | null;
      aggregateId: string;
      aggregateName: string;
      aggregateVersion: string;
      actorName: string;
      actorVersion: string;
      actorPath: string;
      identity: Readonly<Record<string, unknown>>;
      sessionName: string;
      aggregateSessionLock: IAggregateSessionLock;
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
            connection.close(1011, 'aggregate-session-command-replay-failed'),
          ),
        ),
      ),
    );
  }
}
