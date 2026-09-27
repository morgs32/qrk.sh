import {
  makeZerospinError,
  mapParseError,
  recognizeZerospinError,
  type IAnyError,
} from '@zerospin/error';
import {
  makeTelemetryLayer,
  makeTelemetryTracer,
  TelemetryCollector,
} from '@zerospin/logger';
import { Context, Effect, Schema } from 'effect';

import { encodeCommand } from '../../contracts/encodeCommand.ts';
import { encodeFailure, resolveFailure } from '../../contracts/failureCodec.ts';
import { getFailuresCodec } from '../../contracts/failures.ts';
import { makeMutations } from '../../contracts/make/makeMutations.ts';
import { runContractGuard } from '../../contracts/runContractGuard.ts';
import type {
  IEncodedCommand,
  InferCommand,
  ISessionCommand,
} from '../../contracts/types.ts';
import { validatePayload } from '../../contracts/validatePayload.ts';
import { runProgram } from '../../execution/runProgram.ts';
import type { InferPayloadInput } from '../../models/types.ts';
import { dutils } from '../../utils/dutils.ts';
import { encodeRpcOutcome } from '../../utils/encodeRpcOutcome.ts';
import { getByKeyOrThrow } from '../../utils/getByKeyOrThrow.ts';
import { getAggregateSessionExecutionResources } from '../make/makeAggregateSession.ts';
import type {
  IAggregateSession,
  IAggregateSessionDefinition,
} from '../types.ts';

import { executeCommandTx } from './executeCommandTx/executeCommandTx.ts';
import { makeSessionCommand } from './makeSessionCommand/makeSessionCommand.ts';

/**
 * Stage a local aggregate command: validate, run the synchronous program, optimistic mutate, and
 * commit the complete encoded occurrence. Real sessions hand off to delivery
 * after commit; bound sessions without delivery stop locally.
 * Success commits the command and its optimism. A failed attempt returns its failure
 * without retaining a command or consuming a session/submission position.
 */
export function stageCommand<
  DEFINITION extends IAggregateSessionDefinition,
  CONTRACT_NAME extends keyof DEFINITION['contracts'] & string,
>(props: {
  session: IAggregateSession<DEFINITION>;
  contractName: CONTRACT_NAME;
  payload: InferPayloadInput<
    NonNullable<
      DEFINITION['contracts'][CONTRACT_NAME]['contract']['__payloads']
    >[DEFINITION['contracts'][CONTRACT_NAME]['contract']['version']]
  >;
}) {
  const { session, contractName, payload } = props;
  const resources = getAggregateSessionExecutionResources(
    session as IAggregateSession<IAggregateSessionDefinition>,
  );
  if (resources === undefined) {
    return Effect.runSync(
      encodeRpcOutcome(
        Effect.fail(
          makeZerospinError({
            code: 'aggregate-session-not-ready',
            message:
              'Command staging requires bound session execution resources',
          }),
        ),
      ).pipe(
        Effect.map(result =>
          result._tag === 'Failure'
            ? {
                ...result,
                failure: recognizeZerospinError(Schema.Never, result.failure),
              }
            : result,
        ),
      ),
    );
  }

  const { definition } = session;
  const { runtime, executeAggregateSessionCommand } = resources;

  const context = Context.makeUnsafe<unknown>(
    runtime.runSync(Effect.context()).mapUnsafe,
  );

  const stage = Effect.fn('stageCommand')(function* (): Effect.fn.Return<
    Readonly<{
      command: ISessionCommand<
        InferCommand<
          DEFINITION['contracts'][CONTRACT_NAME]['contract'],
          DEFINITION['contracts'][CONTRACT_NAME]['contract']['version']
        >
      > &
        Readonly<{ sessionIndex: number }>;
      encodedCommand: IEncodedCommand<
        ISessionCommand<
          InferCommand<
            DEFINITION['contracts'][CONTRACT_NAME]['contract'],
            DEFINITION['contracts'][CONTRACT_NAME]['contract']['version']
          >
        > &
          Readonly<{ sessionIndex: number; pushIndex: null }>
      > | null;
    }>,
    IAnyError,
    unknown
  > {
    const startedAt = yield* dutils.date();
    const state = session.store.getState();
    if (!state.isInitialized || state.db === null || state.schema === null) {
      return yield* Effect.fail(
        makeZerospinError({
          code: 'session-store-not-initialized',
          message: 'Session store is not initialized',
        }),
      );
    }
    if (state.sessionStatus !== 'current') {
      return yield* Effect.fail(
        makeZerospinError({
          code: 'aggregate-session-not-current',
          message: `Aggregate command staging requires a current session; received ${state.sessionStatus}`,
        }),
      );
    }
    if (
      state.actorName !== definition.actorName ||
      state.actorVersion !== definition.actorVersion
    ) {
      return yield* Effect.fail(
        makeZerospinError({
          code: 'session-actor-mismatch',
          message: 'Session identity differs from its bound definition actor',
        }),
      );
    }
    const sessionId = state.sessionId;

    const binding = yield* getByKeyOrThrow<
      DEFINITION['contracts'],
      CONTRACT_NAME
    >({
      record: definition.contracts,
      key: contractName,
      recordKind: 'contracts',
    });
    const contract: DEFINITION['contracts'][CONTRACT_NAME]['contract'] =
      binding.contract;
    const version = contract.version;
    const validatedPayload = yield* validatePayload(contract, {
      version,
      payload,
    });
    const command = yield* makeSessionCommand({
      aggregateId: state.aggregateId,
      aggregateName: definition.aggregateName,
      actorName: definition.actorName,
      actorVersion: definition.actorVersion,
      contract,
      sessionName: definition.sessionName,
      sessionId,
      identity: yield* Schema.encodeEffect(definition.identity.identitySchema)(
        state.identity,
      ).pipe(
        mapParseError({
          code: 'command-identity-invalid',
          prefix: 'Failed to encode command identity',
        }),
      ),
      validatedPayload,
      version,
    });
    const encodedCommand = yield* encodeCommand({ contract, command });

    const madeMutations = yield* runContractGuard({
      contract,
      queryDb: state.db,
      identity: state.identity,
      payload: command.payload,
    })
      .pipe(
        Effect.andThen(
          makeMutations({
            identity: state.identity,
            contract,
            models: definition.models,
            command,
          }),
        ),
      )
      .pipe(
        runProgram,
        Effect.catch(failure =>
          encodeFailure(contract, failure).pipe(
            Effect.flatMap(failure => resolveFailure(contract, failure)),
            Effect.flatMap(Effect.fail),
          ),
        ),
      );

    return yield* executeCommandTx(state.db, {
      settleLocally: resources.settleLocally === true,
      sessionId,
      madeMutations,
      encodedCommand,
      startedAt,
      state,
      command,
    });
  });

  let committedCommand:
    | IEncodedCommand<
        ISessionCommand & Readonly<{ sessionIndex: number; pushIndex: null }>
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
      Effect.provideContext(context),
      encodeRpcOutcome,
    ),
  );

  if (
    executeAggregateSessionCommand !== undefined &&
    resources.settleLocally !== true &&
    committedCommand !== undefined
  ) {
    const command = committedCommand;
    runtime.runFork(
      executeAggregateSessionCommand({ command }).pipe(
        Effect.flatMap(receipt =>
          receipt.commandId === command.id
            ? Effect.void
            : Effect.fail(
                makeZerospinError({
                  code: 'aggregate-session-command-receipt-invalid',
                  message:
                    'Session push receipt does not match the committed command',
                }),
              ),
        ),
        Effect.catch(() => Effect.void),
        Effect.provide(makeTelemetryLayer(telemetryCollector)),
      ),
    );
  }
  return result._tag === 'Failure'
    ? {
        ...result,
        failure: recognizeZerospinError(
          getFailuresCodec(
            definition.contracts[contractName]?.contract.failures ?? {},
          ),
          result.failure,
        ),
      }
    : result;
}
