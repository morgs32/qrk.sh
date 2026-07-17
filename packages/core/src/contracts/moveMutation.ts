import type { IModel, InferIdFromAbbreviation } from '../models/types.ts';

export type IMoveMutation<MODEL extends IModel> = {
  readonly model: MODEL;
  readonly modelVersion: string;
  readonly operationName: 'move';
  readonly resourceId: InferIdFromAbbreviation<MODEL['abbreviation']>;
  readonly operation: {
    readonly property: string;
    readonly prevId: string;
    readonly nextId: string;
  };
};
