import {
  makeZerospinError,
  type IAnyError,
  type IResult,
  type IZerospinErrorJson,
} from '@zerospin/error';
import { Effect } from 'effect';

import { resolveContractResult } from '../contracts/resultCodec.ts';
import type { InferContractResult } from '../contracts/types.ts';
import type { InferPayloadInput } from '../models/types.ts';
import type { INodeCommandInput } from '../Node/types.ts';
import { getByKeyOrThrow } from '../utils/getByKeyOrThrow.ts';

import type { IServiceSession, IServiceSessionDefinition } from './types.ts';

type Stage = (props: {
  contractName: string;
  payload: unknown;
}) => Promise<IResult<INodeCommandInput, IAnyError | IZerospinErrorJson>>;
type Execution = {
  stage: Stage;
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
export async function stageServiceCommand<
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
    Omit<INodeCommandInput, 'staging'> & {
      readonly staging: Omit<INodeCommandInput['staging'], 'result'> & {
        readonly result: InferContractResult<D['contracts'][K]>;
      };
    },
    IAnyError | IZerospinErrorJson
  >
> {
  const execute = executions.get(props.session);
  if (execute === undefined) {
    return Promise.resolve({
      _tag: 'Failure',
      failure: makeZerospinError({ code: 'service-session-not-ready' }),
    });
  }
  const staged = await execute.stage(props);
  if (staged._tag === 'Failure') return staged;
  const decoded = Effect.runSync(
    getByKeyOrThrow<D['contracts'], K>({
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
