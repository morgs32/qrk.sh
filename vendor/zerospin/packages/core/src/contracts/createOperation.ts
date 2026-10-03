import type {
  InferDecodedRow,
  InferIdFromAbbreviation,
  IShape,
} from '@zerospin/schema';

import type { IModel } from '../models/types.ts';

export type ICreateOperation<
  MODEL extends IModel,
  ATTRIBUTES extends IShape = MODEL['attributes'],
> = {
  readonly model: MODEL;
  readonly modelVersion: string;
  readonly operationName: 'create';
  readonly resourceId: InferIdFromAbbreviation<MODEL['abbreviation']>;
  readonly body: {
    readonly attributes: InferDecodedRow<ATTRIBUTES>;
  };
};

export type InferModelCreateAttributes<MODEL extends IModel> = InferDecodedRow<
  MODEL['attributes']
>;
