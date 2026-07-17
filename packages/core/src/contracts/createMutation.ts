import type {
  IModel,
  InferDecodedRow,
  InferIdFromAbbreviation,
  IShape,
} from '../models/types.ts';

export type ICreateMutation<
  MODEL extends IModel,
  ATTRIBUTES extends IShape = MODEL['attributes'],
> = {
  readonly model: MODEL;
  readonly modelVersion: string;
  readonly operationName: 'create';
  readonly resourceId: InferIdFromAbbreviation<MODEL['abbreviation']>;
  readonly operation: {
    readonly attributes: InferDecodedRow<ATTRIBUTES>;
  };
};

export type InferModelCreateAttributes<MODEL extends IModel> = InferDecodedRow<
  MODEL['attributes']
>;
