import type { InferModelOperations } from '../contracts/InferModelOperations.ts';
import type { DeclaredKeys } from '../utils/DeclaredKeys.ts';

import type { IServiceRegistry } from './types.ts';
export type InferServiceOperations<SERVICE_REGISTRY extends IServiceRegistry> =
  {
    [VERSION in DeclaredKeys<SERVICE_REGISTRY>]: InferModelOperations<
      SERVICE_REGISTRY[VERSION]['models']
    >;
  }[DeclaredKeys<SERVICE_REGISTRY>];
