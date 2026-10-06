import type {
  InferDecodedRow,
  InferIdFromAbbreviation,
  IShape,
} from '@zerospin/shapes';

import type { IModel } from '../models/types.ts';

export type IUpdateOperation<
  MODEL extends IModel,
  ATTRIBUTES extends IShape = MODEL['attributes'],
> = {
  readonly model: MODEL;
  readonly modelVersion: string;
  readonly operationName: 'update';
  readonly resourceId: InferIdFromAbbreviation<MODEL['abbreviation']>;
  readonly body: {
    readonly attributes: Partial<InferDecodedRow<ATTRIBUTES>>;
    readonly mask?: string[];
  };
};
