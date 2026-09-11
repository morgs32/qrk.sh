import { primitives } from '@zerospin/schema';
import { Effect, Schema } from 'effect';

import { makeModel, makeModelVersion, Model } from './makeModel.ts';
import { requireVersion as requireModelVersion } from './requireVersion.ts';
import type { IModel, IModelReplica } from './types.ts';

const MakeReplicaPropsSchema = Schema.Struct({
  sourceModel: Schema.declare(
    (input: unknown): input is IModel => input instanceof Model,
  ).check(
    Schema.makeFilter(
      (model: IModel) =>
        !Model.isReplica(model) || 'sourceModel must be an authored model',
    ),
  ),
  serviceName: Schema.String,
  modelVersion: Schema.String,
});

export function makeReplica<
  SOURCE_MODEL extends IModel,
  SERVICE_NAME extends string,
  MODEL_VERSION extends SOURCE_MODEL['version'],
>(props: {
  sourceModel: SOURCE_MODEL;
  serviceName: SERVICE_NAME;
  modelVersion: MODEL_VERSION;
}): IModelReplica<SOURCE_MODEL, SERVICE_NAME, MODEL_VERSION>;

export function makeReplica(props: {
  sourceModel: IModel;
  serviceName: string;
  modelVersion: string;
}): unknown {
  const { sourceModel, serviceName, modelVersion } = Schema.decodeUnknownSync(
    MakeReplicaPropsSchema,
    {
      onExcessProperty: 'error',
    },
  )(props);

  const deletedAt = primitives.date({ nullable: true });
  const serviceIndex = primitives.integer({ nullable: true });
  const replica = makeModelVersion(
    makeModel({
      name: sourceModel.modelName,
      abbreviation: sourceModel.abbreviation,
    }),
    {
      attributes: sourceModel.attributes,
      propertiesShape: {
        ...sourceModel.propertiesShape,
        deletedAt,
        serviceIndex,
      },
      indexes: sourceModel.indexes,
      version: sourceModel.version,
    },
  );
  Model.markReplica(replica, {
    sourceModel,
    serviceName,
  });
  return Effect.runSync(requireModelVersion(replica, modelVersion));
}
