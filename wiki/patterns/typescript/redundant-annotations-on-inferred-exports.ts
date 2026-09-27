import { makeSystemRpcClient } from '@zerospin/sdk';

/**
 * Let factory inference stand — do not repeat return type on exported const.
 *
 * @bad `export const systemRpc: SomeFactoryReturn = makeSystemRpcClient(system.id)`.
 */
export const systemRpc = makeSystemRpcClient(system.id);

declare const system: { id: string };
