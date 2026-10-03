import type { IAnyError } from '@zerospin/error';
import { type Effect, type Schema } from 'effect';

import type { InferCommandPayload } from '../models/types.ts';

import type { IContract } from './types.ts';

/** Backend definition metadata; public session construction excludes these contracts. */
export interface IAsyncContractDefinition {
  readonly external: {
    readonly result: Schema.Codec<unknown, unknown>;
    readonly timeoutMs: number;
    readonly retryDelayMs: number;
    readonly program: {
      bivarianceHack(props: {
        payload: unknown;
      }): Effect.Effect<unknown, IAnyError, unknown>;
    }['bivarianceHack'];
  };
}
export type IPublicContracts<C extends Readonly<Record<string, IContract>>> = {
  readonly [K in keyof C as C[K] extends {
    readonly async: IAsyncContractDefinition;
  }
    ? never
    : K]: C[K] extends { readonly mapping: { readonly original: infer O } }
    ? O
    : C[K];
};
export function publicContracts<C extends Readonly<Record<string, IContract>>>(
  contracts: C,
): IPublicContracts<C>;
export function publicContracts(
  contracts: Readonly<Record<string, IContract>>,
) {
  return Object.fromEntries(
    Object.entries(contracts)
      .filter(([, contract]) => contract.async === undefined)
      .map(([name, contract]) => [
        name,
        contract.mapping?.original ?? contract,
      ]),
  );
}
export function assertActorAsyncContracts(
  contracts: Readonly<Record<string, IContract>>,
) {
  for (const [name, contract] of Object.entries(contracts)) {
    if (name !== contract.commandName) {
      throw new Error(
        `Actor contract key ${name} must match ${contract.commandName}`,
      );
    }
    for (const [key, permitted] of Object.entries(
      contract.mapping?.contracts ?? {},
    )) {
      if (
        key !== permitted.commandName ||
        permitted.async === undefined ||
        contracts[key] !== permitted
      ) {
        throw new Error(
          `Mapped contract ${name} must reference an exact async contract registered on the same actor: ${key}`,
        );
      }
    }
  }
}
export type InferAsyncPayload<C extends IContract> = C extends {
  readonly async: IAsyncContractDefinition;
}
  ? InferCommandPayload<C['payload']>
  : never;
