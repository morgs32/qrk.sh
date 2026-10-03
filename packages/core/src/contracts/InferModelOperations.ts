import type { IAnyModels } from '../models/types.ts';

import type { IOperation } from './types.ts';
/** Owned operations permitted for each registered model. */
export type InferModelOperations<MODELS extends IAnyModels> = {
  [NAME in keyof MODELS]: IOperation<MODELS[NAME]>;
}[keyof MODELS];
