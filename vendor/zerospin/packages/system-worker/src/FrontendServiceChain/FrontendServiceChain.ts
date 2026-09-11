import { RoutePattern } from '@remix-run/route-pattern';
import { createHref } from '@remix-run/route-pattern/href';
import { createMatcher } from '@remix-run/route-pattern/match';
import type { ServiceFrontendLockSchema } from '@zerospin/core/frontendController/makeServiceFrontendLock';
import type { IServiceFrontendFinalizedCommand } from '@zerospin/core/serviceSession/types';
import { encodeRpc } from '@zerospin/core/utils/encodeRpc';
import {
  mapParseError,
  ZerospinError,
  type IAnyErrorJson,
  type IEncodedResult,
} from '@zerospin/error';
import config from 'config';
import { Effect, Schema } from 'effect';
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

import { frontendServiceChainDbConfig } from './frontendServiceChainDbConfig.js';
import { getCommands } from './getCommands/getCommands.js';
import { onConnect } from './onConnect/onConnect.js';
import { onMessage } from './onMessage/onMessage.js';
import { receiveDeltas } from './receiveDeltas/receiveDeltas.js';

const frontendServiceChainFixedDORepoConfig = makeFixedDORepoConfig({
  abbreviation: systemWorkerAbbreviations.frontendServiceChain,
  repoType: 'FrontendServiceChain',
  namePattern: RoutePattern.parse(
    '/:systemId/:serviceName/:serviceVersion/:selectionPath/:frontendName',
  ),
  managedRuntime,
  dbConfig: Effect.fn('FrontendServiceChain.dbConfig')(function* ({ key }) {
    const owner = config.system.services[key.serviceName]?.[key.serviceVersion];
    if (owner === undefined) {
      return yield* new ZerospinError({ code: 'selection-owner-unavailable' });
    }
    const matched = yield* Effect.try({
      try: () =>
        createMatcher(owner.authentication.pattern).match(
          new URL(key.selectionPath, 'https://selection.invalid'),
        ),
      catch: () => new ZerospinError({ code: 'selection-path-invalid' }),
    });
    const selection = yield* Schema.decodeUnknownEffect(
      owner.authentication.selectionSchema,
    )(matched?.params, { onExcessProperty: 'error' }).pipe(
      mapParseError({
        code: 'selection-path-invalid',
        prefix: 'Invalid chain selection fields',
      }),
    );
    const encoded = yield* Schema.encodeEffect(
      owner.authentication.selectionSchema,
    )(selection).pipe(
      mapParseError({
        code: 'selection-path-invalid',
        prefix: 'Invalid chain selection encoding',
      }),
    );
    const strings = yield* Schema.decodeUnknownEffect(
      Schema.Record(Schema.String, Schema.String),
    )(encoded).pipe(
      mapParseError({
        code: 'selection-path-invalid',
        prefix: 'Encoded selection fields must be strings',
      }),
    );
    if (
      createHref(owner.authentication.pattern, strings) !== key.selectionPath
    ) {
      return yield* new ZerospinError({ code: 'selection-path-noncanonical' });
    }
    return frontendServiceChainDbConfig;
  }),
});

export class FrontendServiceChain extends makeFixedDORepo({
  namespaceBinding: 'FRONTEND_SERVICE_CHAIN',
  baseClass: Server,
  fixedDORepoConfig: frontendServiceChainFixedDORepoConfig,
}) {
  static options = { hibernate: true };

  declare readonly getConnections: Server['getConnections'];

  static override readonly fixedDORepoConfig =
    frontendServiceChainFixedDORepoConfig;

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
            serviceName: string;
            serviceVersion: string;
            selectionPath: string;
            authentication: Readonly<Record<string, unknown>>;
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
      }),
  });
  /*
   * Exposes the already bound deltasSubscriber capability from FrontendServiceChain.
   *
   * 1. Return the bound capability.
   */
  get deltasSubscriber() {
    // 1 — reuse the existing private queue/subscriber instance
    return this.#deltasSubscriber;
  }

  /*
   * Frontend reconnects and snapshot publication checks read the retained FSC
   * log. This reader returns a bounded, validated contiguous suffix plus the
   * current publication tip.
   *
   * 1. Run the bound domain operation.
   */
  async getCommands(props: { afterServiceIndex: number }): Promise<
    IEncodedResult<
      Readonly<{
        commands: readonly IServiceFrontendFinalizedCommand[];
        tip: number;
      }>,
      IAnyErrorJson
    >
  > {
    const { afterServiceIndex } = props;

    // 1 — run getCommands with the instance-bound dependencies and encode its RPC outcome
    return managedRuntime.runPromise(
      getCommands({
        afterServiceIndex,
        db: this.db,
      }).pipe(encodeRpc),
    );
  }

  /*
   * The service frontend log accepts SystemRepo-forwarded upgrade context.
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
      selectionPath: string;
      authentication: Readonly<Record<string, unknown>>;
      frontendName: string;
      serviceFrontendLock: Schema.Schema.Type<typeof ServiceFrontendLockSchema>;
    }>,
    context: ConnectionContext,
  ): Promise<void> {
    // 1 — run onConnect with the instance-bound dependencies
    return managedRuntime.runPromise(
      onConnect({ connection, request: context.request, key: this.key }),
    );
  }

  /*
   * The service frontend log handles the one initial resume message by
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
      selectionPath: string;
      authentication: Readonly<Record<string, unknown>>;
      frontendName: string;
      serviceFrontendLock: Schema.Schema.Type<typeof ServiceFrontendLockSchema>;
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
            connection.close(1011, 'service-frontend-command-replay-failed'),
          ),
        ),
      ),
    );
  }
}
