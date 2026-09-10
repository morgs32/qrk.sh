import type { InferIdFromAbbreviation, IShape } from '@zerospin/schema';

import type { IModel, InferResource } from '../models/types.ts';

export type IReplicateMutation<
  MODEL extends IModel,
  PROPERTIES_SHAPE extends IShape = MODEL['propertiesShape'],
> = {
  readonly model: MODEL;
  readonly modelVersion: string;
  readonly operationName: 'replicate';
  readonly resourceId: InferIdFromAbbreviation<MODEL['abbreviation']>;
  readonly operation: {
    readonly serviceName: string;
    readonly serviceVersion?: string;
    readonly serviceIndex?: number;
    readonly resource: InferResource<MODEL, PROPERTIES_SHAPE>;
  };
};
