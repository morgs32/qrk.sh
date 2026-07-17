import type { IModel, InferIdFromAbbreviation } from '../models/types.ts';

export type IDeleteMutation<MODEL extends IModel> = {
  readonly model: MODEL;
  readonly modelVersion: string;
  readonly operationName: 'delete';
  readonly resourceId: InferIdFromAbbreviation<MODEL['abbreviation']>;
  readonly operation: Record<string, never>;
};
