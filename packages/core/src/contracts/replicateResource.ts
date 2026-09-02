import type { InferIdFromAbbreviation, IShape } from '@zerospin/schema';

import type { IModel, InferResource } from '../models/types.ts';

export type IReplicateResourceMutation<
  MODEL extends IModel,
  PROPERTIES_SHAPE extends IShape = MODEL['propertiesShape'],
> = {
  readonly model: MODEL;
  readonly modelVersion: string;
  readonly operationName: 'replicateResource';
  readonly resourceId: InferIdFromAbbreviation<MODEL['abbreviation']>;
  readonly operation: {
    readonly serviceName: string;
    readonly resource: InferResource<MODEL, PROPERTIES_SHAPE>;
  };
};
