import type { InferCommands } from '../contracts/InferCommands.ts';
import type { DeclaredKeys } from '../utils/DeclaredKeys.ts';

import type { IServiceRegistry } from './types.ts';

/** The command vocabulary across all declared versions of one service. */
export type InferServiceCommands<SERVICE_REGISTRY extends IServiceRegistry> = {
  [VERSION in DeclaredKeys<SERVICE_REGISTRY>]: InferCommands<
    SERVICE_REGISTRY[VERSION]['contracts']
  >;
}[DeclaredKeys<SERVICE_REGISTRY>];
