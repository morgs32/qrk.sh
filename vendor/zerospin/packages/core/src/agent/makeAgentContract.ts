import type { IPrimitiveDescriptorDecoded } from '@zerospin/shapes';

import { assertSameCoreInstance } from '../assertSameCoreInstance.ts';
import { Contract } from '../contracts/make/makeContractVersion.ts';
import type { IContract } from '../contracts/types.ts';
import { Model } from '../models/defineModel.ts';
import type { IModel } from '../models/types.ts';

/** Payload fields may bind only model fields whose decoded values they accept. */
export type IAgentContractBind<
  CONTRACT extends IContract,
  MODEL extends IModel,
> = {
  readonly [P in keyof CONTRACT['payload'] & string]?: {
    [F in keyof MODEL['propertiesShape'] & string]: IPrimitiveDescriptorDecoded<
      MODEL['propertiesShape'][F]
    > extends IPrimitiveDescriptorDecoded<CONTRACT['payload'][P]>
      ? F
      : never;
  }[keyof MODEL['propertiesShape'] & string];
};

export type IAgentContract<
  CONTRACT extends IContract = IContract,
  MODEL extends IModel = IModel,
  BIND extends Readonly<Record<string, string>> = Readonly<
    Record<string, string>
  >,
> = Readonly<{
  contractVersion: CONTRACT;
  model: MODEL;
  bind: BIND;
}>;
export type IAnyAgentContracts = Readonly<Record<string, IAgentContract>>;
export type InferAgentContracts<CONTRACTS extends IAnyAgentContracts> = {
  readonly [K in keyof CONTRACTS]: CONTRACTS[K]['contractVersion'];
};
export type InferAgentContractBindings<CONTRACTS extends IAnyAgentContracts> = {
  readonly [K in keyof CONTRACTS]: Readonly<{
    model: CONTRACTS[K]['model'];
    bind: CONTRACTS[K]['bind'];
  }>;
};

/** Attach row-form metadata without changing the canonical execution contract. */
export function makeAgentContract<
  const CONTRACT extends IContract,
  const MODEL extends IModel,
  const BIND extends Readonly<Record<string, string>>,
>(props: {
  contractVersion: CONTRACT;
  model: MODEL;
  bind: BIND &
    IAgentContractBind<NoInfer<CONTRACT>, NoInfer<MODEL>> & {
      [K in Exclude<keyof BIND, keyof CONTRACT['payload']>]: never;
    };
}): IAgentContract<CONTRACT, MODEL, BIND>;
export function makeAgentContract(props: IAgentContract): IAgentContract {
  assertAgentContract(props);
  return Object.freeze({
    contractVersion: props.contractVersion,
    model: props.model,
    bind: Object.freeze({ ...props.bind }),
  });
}

/** Recheck canonical references and field membership at each declaration boundary. */
export function assertAgentContract(binding: IAgentContract): void {
  const { contractVersion, model, bind } = binding;
  assertSameCoreInstance({
    value: contractVersion,
    expected: Contract,
    kind: 'Contract',
  });
  assertSameCoreInstance({ value: model, expected: Model, kind: 'Model' });
  if (!(contractVersion instanceof Contract) || !(model instanceof Model)) {
    throw new Error(
      'Agent contracts require canonical Contract and Model declarations',
    );
  }
  if (
    contractVersion.external !== undefined ||
    contractVersion.mapping !== undefined
  ) {
    throw new Error('Agent sessions require ordinary browser contracts');
  }
  for (const [payloadField, modelField] of Object.entries(bind)) {
    if (!Object.hasOwn(contractVersion.payload, payloadField)) {
      throw new Error(
        `Agent binding payload field ${payloadField} is outside the contract`,
      );
    }
    if (
      typeof modelField !== 'string' ||
      !Object.hasOwn(model.propertiesShape, modelField)
    ) {
      throw new Error(
        `Agent binding model field ${String(modelField)} is outside the model`,
      );
    }
  }
}
