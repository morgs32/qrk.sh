import type { InferIdFromAbbreviation } from '@zerospin/shapes';

import type { IModel } from '../models/types.ts';

export type IMoveOperation<MODEL extends IModel> = {
  readonly model: MODEL;
  readonly modelVersion: string;
  readonly operationName: 'move';
  readonly resourceId: InferIdFromAbbreviation<MODEL['abbreviation']>;
  readonly body: {
    readonly property: string;
    readonly prevId: string;
    readonly nextId: string;
  };
};
