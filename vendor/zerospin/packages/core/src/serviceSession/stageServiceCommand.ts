import {
  catchZerospinError,
  encodeError,
  makeZerospinError,
  PublicFailureSchema,
  recognizeZerospinError,
  type IAnyError,
  type IResult,
  type IZerospinErrorJson,
} from '@zerospin/error';
import { Effect, Schema } from 'effect';

import { resolveFailure } from '../contracts/failureCodec.ts';
import { resolveContractResult } from '../contracts/resultCodec.ts';
import type { InferContractResult } from '../contracts/types.ts';
import type { InferPayloadInput } from '../models/types.ts';
import type { IServiceNodeCommandInput } from '../ServiceNode/types.ts';
import { getByKeyOrThrow } from '../utils/getByKeyOrThrow.ts';

import type {
  IServiceSession,
  IServiceSessionCommand,
  IServiceSessionDefinition,
  IServiceStageFailure,
} from './types.ts';

type Stage = (props: {
  contractName: string;
  payload: unknown;
}) => IResult<IServiceNodeCommandInput, IAnyError | IZerospinErrorJson>;
type Execution = {
  stage: Stage;
  accept(
    command: IServiceNodeCommandInput,
  ): Promise<IResult<void, IAnyError | IZerospinErrorJson>>;
  can(props: {
    contractName: string;
    payload: unknown;
  }): IResult<void, IAnyError | IZerospinErrorJson>;
};
const executions = new WeakMap<object, Execution>();

/** A browser lifetime supplies durable Node acceptance; disposal revokes it. */
export function bindServiceSessionExecution(
  session: object,
  execute: Execution,
): () => void {
  executions.set(session, execute);
  return () => {
    if (executions.get(session) === execute) executions.delete(session);
  };
}

/** Resolves successfully only after the offline command is durably accepted by its Node. */
export function stageServiceCommand<
  D extends IServiceSessionDefinition,
  K extends keyof D['contracts'] & string,
>(props: {
  session: IServiceSession<D>;
  contractName: K;
  payload: InferPayloadInput<
    NonNullable<D['contracts'][K]['__payloads']>[D['contracts'][K]['version']]
  >;
}): Promise<
  IResult<
    IServiceSessionCommand<InferContractResult<D['contracts'][K]>>,
    IAnyError | IZerospinErrorJson
  >
>;
export function stageServiceCommand(props: {
  session: IServiceSession;
  contractName: string;
  payload: unknown;
}) {
  return props.session.stageCommand(props);
}

export async function stageBoundServiceSessionCommand(props: {
  session: { readonly definition: IServiceSessionDefinition };
  contractName: string;
  payload: unknown;
  onStageFailure(event: IServiceStageFailure): void;
}): Promise<IResult<IServiceSessionCommand, IAnyError | IZerospinErrorJson>> {
  const execute = executions.get(props.session);
  if (execute === undefined) {
    const failure = Effect.runSync(
      encodeError(
        makeZerospinError({ code: 'service-session-not-ready' }),
      ).pipe(
        Effect.map(encoded => recognizeZerospinError(Schema.Never, encoded)),
      ),
    );
    props.onStageFailure({ contractName: props.contractName, failure });
    return { _tag: 'Failure', failure };
  }
  let staged;
  try {
    const result = execute.stage(props);
    if (result._tag === 'Failure') {
      const encoded = Schema.decodeUnknownSync(PublicFailureSchema)(
        'toJson' in result.failure
          ? Effect.runSync(encodeError(result.failure))
          : result.failure,
      );
      const contract = props.session.definition.contracts[props.contractName];
      const failure =
        contract === undefined
          ? recognizeZerospinError(Schema.Never, encoded)
          : Effect.runSync(resolveFailure(contract, encoded));
      staged = { _tag: 'Failure' as const, failure };
    } else {
      staged = result;
    }
  } catch (cause) {
    const failure = Effect.runSync(
      encodeError(
        catchZerospinError({
          code: 'service-command-staging-exception',
          message: 'Command staging failed',
        })(cause),
      ).pipe(
        Effect.map(encoded => recognizeZerospinError(Schema.Never, encoded)),
      ),
    );
    props.onStageFailure({ contractName: props.contractName, failure });
    throw cause;
  }
  if (staged._tag === 'Failure') {
    props.onStageFailure({
      contractName: props.contractName,
      failure: staged.failure,
    });
    return staged;
  }
  const accepted = await execute.accept(staged.success);
  if (accepted._tag === 'Failure') return accepted;
  const decoded = Effect.runSync(
    getByKeyOrThrow({
      record: props.session.definition.contracts,
      key: props.contractName,
      recordKind: 'contracts',
    }).pipe(
      Effect.flatMap(contract =>
        resolveContractResult(contract, {
          commandName: staged.success.commandName,
          contractVersion: staged.success.contractVersion,
          result: staged.success.staging.result,
        }),
      ),
      Effect.result,
    ),
  );
  if (decoded._tag === 'Failure') {
    return { _tag: 'Failure', failure: decoded.failure };
  }
  return {
    _tag: 'Success',
    success: {
      ...staged.success,
      staging: { ...staged.success.staging, result: decoded.success },
    },
  };
}

export function canServiceCommand(
  session: object,
  props: { contractName: string; payload: unknown },
): IResult<void, IAnyError | IZerospinErrorJson> {
  const execution = executions.get(session);
  return (
    execution?.can(props) ?? {
      _tag: 'Failure',
      failure: makeZerospinError('service-session-not-ready'),
    }
  );
}
