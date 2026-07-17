import type {
  IModel,
  InferIdFromAbbreviation,
  InferResource,
  IShape,
} from '../models/types.ts';

export type IReplicateResourceMutation<
  MODEL extends IModel,
  ATTRIBUTES extends IShape = MODEL['attributes'],
> = {
  readonly model: MODEL;
  readonly modelVersion: string;
  readonly operationName: 'replicateResource';
  readonly resourceId: InferIdFromAbbreviation<MODEL['abbreviation']>;
  readonly operation: {
    readonly serviceName: string;
    readonly resource: InferResource<MODEL, ATTRIBUTES>;
  };
};
