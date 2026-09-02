import type {
  InferDecodedRow,
  InferIdFromAbbreviation,
  IShape,
} from '@zerospin/schema';

import type { IModel } from '../models/types.ts';

export type IUpdateMutation<
  MODEL extends IModel,
  ATTRIBUTES extends IShape = MODEL['attributes'],
> = {
  readonly model: MODEL;
  readonly modelVersion: string;
  readonly operationName: 'update';
  readonly resourceId: InferIdFromAbbreviation<MODEL['abbreviation']>;
  readonly operation: {
    readonly attributes: Partial<InferDecodedRow<ATTRIBUTES>>;
    readonly mask?: string[];
  };
};
