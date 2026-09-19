import { mapParseError, ZerospinError, type IAnyError } from '@zerospin/error';
import {
  makeTelemetryLayer,
  makeTelemetryTracer,
  TelemetryCollector,
} from '@zerospin/logger';
import type { CuidFactory } from '@zerospin/schema';
import { Effect, Schema } from 'effect';

import { encodeCommand } from '../contracts/encodeCommand.ts';
import { makeMutations } from '../contracts/makeMutations.ts';
import { makeSessionCommand } from '../contracts/makeSessionCommand.ts';
import type {
  IChainedCommand,
  IEncodedCommand,
  InferCommand,
  ISessionCommand,
} from '../contracts/types.ts';
import { validatePayload } from '../contracts/validatePayload.ts';
import type { IAggregateFrontendController } from '../frontendController/types.ts';
import type { InferPayloadInput } from '../models/types.ts';
import type { MonotonicFactory } from '../services/MonotonicFactory.ts';
import { dutils } from '../utils/dutils.ts';
import { encodeRpc } from '../utils/encodeRpc.ts';
import { getByKeyOrThrow } from '../utils/getByKeyOrThrow.ts';

import { Db, executeCommandTx } from './executeCommandTx.ts';
import { getAggregateSessionExecutionResources } from './makeAggregateSession.ts';
import type { IFrontendDelta, ISession } from './types.ts';

/**
 * Stage a local aggregate command: validate, guard, optimistic mutate, and
 * commit the complete encoded occurrence. Real sessions hand off to delivery
 * after commit; unbound or mock sessions without delivery stop locally.
 */
export function stageCommand<
  FRONTEND extends IAggregateFrontendController,
  CONTRACT_NAME extends keyof FRONTEND['contracts'] & string,
>(props: {
  session: ISession<FRONTEND>;
  contractName: CONTRACT_NAME;
  payload: InferPayloadInput<
    NonNullable<
      FRONTEND['contracts'][CONTRACT_NAME]['contract']['__payloads']
    >[FRONTEND['contracts'][CONTRACT_NAME]['contract']['version']]
  >;
}) {
  const { session, contractName, payload } = props;
  const resources = getAggregateSessionExecutionResources(
    session as ISession<IAggregateFrontendController>,
  );
  if (resources === undefined) {
    return Effect.runSync(
      encodeRpc(
        Effect.fail(
          new ZerospinError({
            code: 'aggregate-frontend-session-not-ready',
            message:
              'Command staging requires bound session execution resources',
          }),
        ),
      ),
    );
  }

  const { frontend } = session;
  const { guards, runtime, executeAggregateFrontendCommand } = resources;

  const stage = Effect.fn('stageCommand')(function* (): Effect.fn.Return<
    Readonly<{
      command: IChainedCommand<
        InferCommand<
          FRONTEND['contracts'][CONTRACT_NAME]['contract'],
          FRONTEND['contracts'][CONTRACT_NAME]['contract']['version']
        >,
        IFrontendDelta
      > &
        Readonly<{ sessionIndex: number }>;
      encodedCommand: IEncodedCommand<
        IChainedCommand<
          InferCommand<
            FRONTEND['contracts'][CONTRACT_NAME]['contract'],
            FRONTEND['contracts'][CONTRACT_NAME]['contract']['version']
          >,
          IFrontendDelta
        > &
          Readonly<{ sessionIndex: number; pushIndex: null }>
      > | null;
    }>,
    IAnyError,
    CuidFactory | MonotonicFactory
  > {
    const state = session.store.getState();
    if (!state.isInitialized || state.db === null || state.schema === null) {
      return yield* new ZerospinError({
        code: 'session-store-not-initialized',
        message: 'Session store is not initialized',
      });
    }
    if (state.sessionStatus !== 'current') {
      return yield* new ZerospinError({
        code: 'aggregate-frontend-session-not-current',
        message: `Aggregate command staging requires a current session; received ${state.sessionStatus}`,
      });
    }
    const sessionId = state.sessionId;

    const binding = yield* getByKeyOrThrow<
      FRONTEND['contracts'],
      CONTRACT_NAME
    >({
      record: frontend.contracts,
      key: contractName,
      recordKind: 'contracts',
    });
    const contract: FRONTEND['contracts'][CONTRACT_NAME]['contract'] =
      binding.contract;
    const version = contract.version;
    const validatedPayload = yield* validatePayload(contract, {
      version,
      payload,
    });
    const command = yield* makeSessionCommand({
      aggregateId: state.aggregateId,
      aggregateName: frontend.aggregateName,
      contract,
      frontendName: frontend.name,
      sessionId,
      systemName: frontend.systemName,
      authentication: yield* Schema.encodeEffect(
        frontend.authentication.authenticationSchema,
      )(state.authentication).pipe(
        mapParseError({
          code: 'command-authentication-invalid',
          prefix: 'Failed to encode command authentication',
        }),
      ),
      validatedPayload,
      version,
    });
    const chainedAt = yield* dutils.date();
    const encodedCommand = yield* encodeCommand({ contract, command });

    const madeMutations = yield* makeMutations({
      authentication: state.authentication,
      contract,
      models: frontend.models,
      command,
    }).pipe(
      Effect.match({
        onFailure: failure => ({ failure }),
        onSuccess: success => ({ success }),
      }),
    );

    return yield* executeCommandTx({
      guards,
      authentication: state.authentication,
      sessionId,
      madeMutations,
      encodedCommand,
      chainedAt,
      state,
      command,
    }).pipe(Effect.provideService(Db, state.db));
  });

  let committedCommand:
    | IEncodedCommand<
        IChainedCommand<ISessionCommand, IFrontendDelta> &
          Readonly<{ sessionIndex: number; pushIndex: null }>
      >
    | undefined;
  const telemetryCollector = session.store.getState().telemetryCollector;
  const result = runtime.runSync(
    stage().pipe(
      Effect.map(execution => {
        if (execution.encodedCommand !== null) {
          committedCommand = execution.encodedCommand;
        }
        return execution.command;
      }),
      Effect.provideService(TelemetryCollector, telemetryCollector),
      Effect.withTracer(makeTelemetryTracer(telemetryCollector)),
      Effect.provideContext(guards.context),
      encodeRpc,
    ),
  );

  if (
    executeAggregateFrontendCommand !== undefined &&
    committedCommand !== undefined
  ) {
    const command = committedCommand;
    runtime.runFork(
      executeAggregateFrontendCommand({ command }).pipe(
        Effect.flatMap(receipt =>
          receipt.commandId === command.id
            ? Effect.void
            : Effect.fail(
                new ZerospinError({
                  code: 'aggregate-frontend-command-receipt-invalid',
                  message:
                    'Frontend push receipt does not match the committed command',
                }),
              ),
        ),
        Effect.catch(() => Effect.void),
        Effect.provide(makeTelemetryLayer(telemetryCollector)),
      ),
    );
  }
  return result;
}
