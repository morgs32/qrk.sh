import '@zerospin/server-only';
import { Schema } from 'effect';

import { assertSameCoreInstance } from '../assertSameCoreInstance.ts';
import { Contract } from '../contracts/make/makeContractVersion.ts';
import type { IAnyContracts, IContract } from '../contracts/types.ts';

import type { IAnyAutomation, IAutomation } from './types.ts';

class Automation {}
export const AutomationSchema = Schema.declare(
  (value: unknown): value is IAnyAutomation => value instanceof Automation,
);

export function makeAutomation<
  const NAME extends string,
  const ON extends IContract,
  const CONTRACTS extends IAnyContracts,
  R = never,
>(
  props: IAutomation<NAME, ON, CONTRACTS, R>,
): IAutomation<NAME, ON, CONTRACTS, R> {
  assertSameCoreInstance({
    value: props.on,
    expected: Contract,
    kind: 'Contract',
  });
  if (
    typeof props.name !== 'string' ||
    !props.name ||
    !(props.on instanceof Contract) ||
    typeof props.program !== 'function'
  ) {
    throw new Error('Invalid automation declaration');
  }
  for (const [name, contract] of Object.entries(props.contracts)) {
    assertSameCoreInstance({
      value: contract,
      expected: Contract,
      kind: 'Contract',
    });
    if (!(contract instanceof Contract) || name !== contract.commandName) {
      throw new Error(`Invalid automation output contract ${name}`);
    }
  }
  return Object.freeze(
    Object.assign(new Automation(), props, {
      contracts: Object.freeze({ ...props.contracts }),
    }),
  );
}
