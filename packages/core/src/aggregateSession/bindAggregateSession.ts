import {
  encodeError,
  makeZerospinError,
  mapParseError,
  recognizeZerospinError,
  type IAnyError,
  type IRecognizedFailure,
  type IResult,
} from '@zerospin/error';
import { CuidFactory, type IShape } from '@zerospin/shapes';
import { eq } from 'drizzle-orm';
import { Effect, Schema, type ManagedRuntime } from 'effect';

import { encodeFailure, resolveFailure } from '../contracts/failureCodec.ts';
import { makeOperations } from '../contracts/make/makeOperations.ts';
import { prepareContractInput } from '../contracts/prepareContractInput.ts';
import { runContractGuard } from '../contracts/runContractGuard.ts';
import type {
  IContract,
  IEncodedCommand,
  InferCommand,
  InferContractResult,
  InferFailure,
  ISessionCommand,
} from '../contracts/types.ts';
import { runProgram } from '../execution/runProgram.ts';
import { makeId } from '../models/make/makeId.ts';
import type { IModel } from '../models/types.ts';
import { MonotonicFactory } from '../services/MonotonicFactory.ts';
import { dutils } from '../utils/dutils.ts';

import type { IAggregateSessionReplayRequirements } from './replayPendingCommandsTx.ts';
import { sessionRepoDbConfig } from './sessionRepoDbConfig.ts';
import { makeSessionCommand } from './stageCommand/makeSessionCommand/makeSessionCommand.ts';
import type { stageSessionCommandTx } from './stageCommand/stageSessionCommandTx/stageSessionCommandTx.ts';
import type {
  IAggregateSession,
  IAggregateSessionDefinition,
  IInitializedSessionState,
} from './types.ts';

type ICommandProps = { contractName: string; payload: unknown };
type IBoundOperations = {
  stage<CONTRACT extends IContract>(props: {
    contractName: string;
    contract: CONTRACT | undefined;
    payload: unknown;
  }): IResult<
    ISessionCommand<InferCommand<CONTRACT>, InferContractResult<CONTRACT>>,
    IRecognizedFailure<InferFailure<CONTRACT>>
  >;
  checkGuards(props: ICommandProps): IRecognizedFailure<IAnyError> | null;
  validate(props: ICommandProps): IResult<void, IRecognizedFailure<IAnyError>>;
  makeId: IAggregateSession['makeId'];
};

export type IAggregateSessionBindingState<
  D extends IAggregateSessionDefinition = IAggregateSessionDefinition,
> = Omit<
  IInitializedSessionState<D['models'], D['claimsSchema']['Type']>,
  'telemetry' | 'telemetryCollector'
>;

/** A delivery owner accepts committed occurrences without changing local outcomes. */
export type IAggregateSessionHandoff = (
  command: IEncodedCommand<ISessionCommand & { readonly pushIndex: null }>,
) => void;

const operationsBySession = new WeakMap<object, IBoundOperations>();

const recognizeFrameworkFailure = (failure: unknown) =>
  encodeError(failure).pipe(
    Effect.map(encoded => recognizeZerospinError(Schema.Never, encoded)),
  );

function settle<CONTRACT extends IContract, SUCCESS, FAILURE, REQUIREMENTS>(
  contract: CONTRACT | undefined,
  program: Effect.Effect<SUCCESS, FAILURE, REQUIREMENTS>,
) {
  return program.pipe(
    Effect.matchEffect({
      onSuccess: success =>
        Effect.succeed({ _tag: 'Success' as const, success }),
      onFailure: failure =>
        (contract === undefined
          ? recognizeFrameworkFailure(failure)
          : encodeFailure(contract, failure).pipe(
              Effect.flatMap(encoded => resolveFailure(contract, encoded)),
              Effect.catch(recognizeFrameworkFailure),
            )
        ).pipe(Effect.map(failure => ({ _tag: 'Failure' as const, failure }))),
    }),
  );
}

/** Prepare all callables before the same synchronous transition publishes readiness. */
export function bindAggregateSession<
  D extends IAggregateSessionDefinition,
>(props: {
  session: IAggregateSession<D>;
  state: IAggregateSessionBindingState<NoInfer<D>>;
  runtime: ManagedRuntime.ManagedRuntime<
    | CuidFactory
    | MonotonicFactory
    | IAggregateSessionReplayRequirements<NoInfer<D>>,
    IAnyError
  >;
  commitCommand: typeof stageSessionCommandTx;
  handoff?: IAggregateSessionHandoff;
}): () => void;
export function bindAggregateSession(props: {
  session: IAggregateSession;
  state: IAggregateSessionBindingState;
  runtime: ManagedRuntime.ManagedRuntime<unknown, IAnyError>;
  commitCommand: typeof stageSessionCommandTx;
  handoff?: IAggregateSessionHandoff;
}) {
  const { session, state, runtime, commitCommand, handoff } = props;
  const { definition } = session;
  const { db, aggregateId, sessionId } = state;
  const metadata = db
    .select()
    .from(sessionRepoDbConfig.schema.sessionMetadata)
    .where(eq(sessionRepoDbConfig.schema.sessionMetadata.sessionId, sessionId))
    .get();
  if (
    state.actorName !== definition.actorName ||
    state.actorVersion !== definition.actorVersion ||
    (metadata !== undefined &&
      (metadata.actorName !== definition.actorName ||
        metadata.actorVersion !== definition.actorVersion))
  ) {
    throw makeZerospinError({
      code: 'session-actor-mismatch',
      message: 'Session identity differs from its bound definition actor',
    });
  }
  const claims = structuredClone(state.claims);
  const encodedClaims = runtime.runSync(
    Schema.encodeEffect(definition.claimsSchema)(claims).pipe(
      mapParseError({
        code: 'command-claims-invalid',
        prefix: 'Failed to encode command claims',
      }),
      runProgram,
    ),
  );
  const requireCurrentState = Effect.fn('requireCurrentAggregateSession')(
    function* () {
      const current = session.store.getState();
      if (!current.isInitialized) {
        return yield* makeZerospinError('session-store-not-initialized');
      }
      if (current.sessionStatus !== 'current') {
        return yield* makeZerospinError({
          code: 'aggregate-session-not-current',
          message:
            'Aggregate command staging requires a current session; received ' +
            current.sessionStatus,
        });
      }
      return current;
    },
  );
  const prepare = Effect.fn('prepareSessionCommand')(function* <
    CONTRACT extends IContract,
  >(commandProps: ICommandProps & { contract: CONTRACT | undefined }) {
    const current = yield* requireCurrentState();
    const { contract } = commandProps;
    if (
      contract === undefined ||
      contract !== definition.contracts[commandProps.contractName]
    ) {
      return yield* makeZerospinError('contract-not-found');
    }
    const input = yield* prepareContractInput({
      contract,
      command: { payload: commandProps.payload },
      claims: structuredClone(claims),
    });
    return { current, contract, input };
  });
  const stage = Effect.fn('stageCommand')(function* <
    CONTRACT extends IContract,
  >(commandProps: ICommandProps & { contract: CONTRACT | undefined }) {
    const startedAt = yield* dutils.date();
    const { current, contract, input } = yield* prepare(commandProps);
    const command = yield* makeSessionCommand<CONTRACT, CONTRACT['version']>({
      aggregateId,
      aggregateName: definition.aggregateName,
      actorName: definition.actorName,
      actorVersion: definition.actorVersion,
      contract,
      sessionName: definition.sessionName,
      sessionId,
      claims: structuredClone(encodedClaims),
      validatedPayload: input.payload,
      version: contract.version,
    });
    const madeOperations = yield* makeOperations({
      db,
      contract,
      models: definition.models,
      command,
      input,
    }).pipe(runProgram);
    return yield* commitCommand(db, {
      sessionId,
      contract,
      command,
      madeOperations,
      startedAt,
      state: current,
    });
  });
  const operations: IBoundOperations = {
    stage(commandProps) {
      const { contract } = commandProps;
      const outcome = runtime.runSync(settle(contract, stage(commandProps)));
      if (outcome._tag === 'Failure') return outcome;
      try {
        handoff?.(outcome.success.encodedCommand);
      } catch (error) {
        // Delivery cannot turn an already committed command into a staging failure.
        console.error('Aggregate session command handoff threw', error);
      }
      return { _tag: 'Success', success: outcome.success.command };
    },
    checkGuards(commandProps) {
      const sessionContract = definition.contracts[commandProps.contractName];
      const outcome = runtime.runSync(
        settle(
          sessionContract,
          Effect.gen(function* () {
            const { contract, input } = yield* prepare({
              contractName: commandProps.contractName,
              contract: sessionContract,
              payload: commandProps.payload,
            });
            yield* runContractGuard({ contract, db, input });
          }),
        ),
      );
      return outcome._tag === 'Failure' ? outcome.failure : null;
    },
    validate(commandProps) {
      const sessionContract = definition.contracts[commandProps.contractName];
      let localId = 0;
      return runtime.runSync(
        settle(
          sessionContract,
          Effect.gen(function* () {
            const { contract, input } = yield* prepare({
              contractName: commandProps.contractName,
              contract: sessionContract,
              payload: commandProps.payload,
            });
            yield* makeOperations({
              contract,
              db,
              models: definition.models,
              command: {
                id: 'cmd_validation',
                commandName: contract.commandName,
                contractVersion: contract.version,
              },
              input,
            });
          }).pipe(
            runProgram,
            Effect.provideService(CuidFactory, () =>
              Effect.sync(() => 'validation' + ++localId),
            ),
            Effect.provideService(MonotonicFactory, () =>
              Effect.sync(() => 'validation' + ++localId),
            ),
          ),
        ),
      );
    },
    makeId(model) {
      runtime.runSync(requireCurrentState());
      return runtime.runSync(makeId(model));
    },
  };
  operationsBySession.set(session, operations);
  session.store.setState({ ...state, claims: structuredClone(claims) });
  return () => {
    if (operationsBySession.get(session) === operations) {
      releaseAggregateSession(session);
    }
  };
}

export function releaseAggregateSession(session: object) {
  operationsBySession.delete(session);
}

const notReady = () =>
  Effect.runSync(
    recognizeFrameworkFailure(makeZerospinError('aggregate-session-not-ready')),
  );

export function stageBoundAggregateSessionCommand<
  DEFINITION extends IAggregateSessionDefinition,
  CONTRACT_NAME extends keyof DEFINITION['contracts'] & string,
>(props: {
  session: IAggregateSession<DEFINITION>;
  contractName: CONTRACT_NAME;
  payload: unknown;
}): IResult<
  ISessionCommand<
    InferCommand<DEFINITION['contracts'][CONTRACT_NAME]>,
    InferContractResult<DEFINITION['contracts'][CONTRACT_NAME]>
  >,
  IRecognizedFailure<InferFailure<DEFINITION['contracts'][CONTRACT_NAME]>>
> {
  const operations = operationsBySession.get(props.session);
  if (operations !== undefined) {
    const contracts: DEFINITION['contracts'] =
      props.session.definition.contracts;
    return operations.stage<DEFINITION['contracts'][CONTRACT_NAME]>({
      contractName: props.contractName,
      contract: contracts[props.contractName],
      payload: props.payload,
    });
  }
  const failure = notReady();
  return { _tag: 'Failure' as const, failure };
}

export function checkBoundAggregateSessionGuards(
  props: { session: IAggregateSession } & ICommandProps,
) {
  const operations = operationsBySession.get(props.session);
  return operations === undefined ? notReady() : operations.checkGuards(props);
}

export function validateBoundAggregateSessionCommand(
  props: { session: IAggregateSession } & ICommandProps,
) {
  return (
    operationsBySession.get(props.session)?.validate(props) ?? {
      _tag: 'Failure' as const,
      failure: notReady(),
    }
  );
}

export function makeBoundAggregateSessionId<
  ATTRIBUTES extends IShape,
  ABBREVIATION extends string,
>(session: IAggregateSession, model: IModel<ATTRIBUTES, ABBREVIATION>) {
  const operations = operationsBySession.get(session);
  if (operations === undefined) {
    throw makeZerospinError('aggregate-session-not-ready');
  }
  return operations.makeId(model);
}
