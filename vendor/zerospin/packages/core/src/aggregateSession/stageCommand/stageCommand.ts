import type { IRecognizedFailure, IResult } from '@zerospin/error';

import type {
  InferCommand,
  InferContractResult,
  InferFailure,
  ISessionCommand,
} from '../../contracts/types.ts';
import type { InferPayloadInput } from '../../models/types.ts';
import type {
  IAggregateSession,
  IAggregateSessionDefinition,
} from '../types.ts';

/** Commit local staging synchronously; the bound delivery owner handles its handoff. */
export function stageCommand<
  D extends IAggregateSessionDefinition,
  K extends keyof D['contracts'] & string,
>(props: {
  session: IAggregateSession<D>;
  contractName: K;
  payload: InferPayloadInput<
    NonNullable<D['contracts'][K]['__payloads']>[D['contracts'][K]['version']]
  >;
}): IResult<
  ISessionCommand<
    InferCommand<D['contracts'][K]>,
    InferContractResult<D['contracts'][K]>
  >,
  IRecognizedFailure<InferFailure<D['contracts'][K]>>
>;
export function stageCommand(props: {
  session: IAggregateSession;
  contractName: string;
  payload: unknown;
}) {
  return props.session.stageCommand(props);
}
