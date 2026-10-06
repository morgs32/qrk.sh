import type { InferIdFromAbbreviation } from '@zerospin/shapes';

import type { IModel } from '../models/types.ts';

export type IDeleteOperation<MODEL extends IModel> = {
  readonly model: MODEL;
  readonly modelVersion: string;
  readonly operationName: 'delete';
  readonly resourceId: InferIdFromAbbreviation<MODEL['abbreviation']>;
  readonly body: Record<string, never>;
};
