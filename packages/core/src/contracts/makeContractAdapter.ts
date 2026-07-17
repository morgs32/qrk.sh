import type { IAnyError } from '@zerospin/error';
import { Effect } from 'effect';

import type { InferCommandPayload } from '../models/types.ts';

import type { IContract } from './types.ts';

export type IContractAdapterEntry<
  FRONTEND_CONTRACT extends IContract = IContract,
  ACTOR_CONTRACT extends IContract = IContract,
> = {
  contract: ACTOR_CONTRACT;
  adapt: (props: {
    contract: FRONTEND_CONTRACT;
    payload: InferCommandPayload<FRONTEND_CONTRACT['payload']>;
  }) => Effect.Effect<
    InferCommandPayload<ACTOR_CONTRACT['payload']>,
    IAnyError
  >;
};

export function makeContractAdapter<
  FRONTEND_CONTRACT extends IContract,
  ACTOR_CONTRACT extends IContract,
>(
  props: IContractAdapterEntry<FRONTEND_CONTRACT, ACTOR_CONTRACT>,
): IContractAdapterEntry<FRONTEND_CONTRACT, ACTOR_CONTRACT> {
  return props;
}

export const identityContractAdapt = (props: {
  contract: IContract;
  payload: unknown;
}) => {
  const { payload } = props;
  return Effect.succeed(payload);
};
