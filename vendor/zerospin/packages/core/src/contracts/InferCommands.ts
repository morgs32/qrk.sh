import type { IAnyContracts, IContract, InferCommand } from './types.ts';

/** Command data only; session identity and delivery state belong to the caller. */
export type InferContractCommands<CONTRACT extends IContract> =
  CONTRACT extends unknown
    ? {
        [VERSION in keyof NonNullable<CONTRACT['__payloads']> & string]: Pick<
          InferCommand<CONTRACT, VERSION>,
          'id' | 'commandName' | 'contractVersion' | 'payload'
        >;
      }[keyof NonNullable<CONTRACT['__payloads']> & string]
    : never;

/** All accepted payload versions of every contract in a declaration. */
export type InferCommands<CONTRACTS extends IAnyContracts> = {
  [NAME in keyof CONTRACTS]: InferContractCommands<CONTRACTS[NAME]>;
}[keyof CONTRACTS];
