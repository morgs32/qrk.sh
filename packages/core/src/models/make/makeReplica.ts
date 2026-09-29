import { primitives } from '@zerospin/schema';
import { Schema } from 'effect';

import { assertSameCoreInstance } from '../../assertSameCoreInstance.ts';
import { defineModel, Model } from '../defineModel.ts';
import type { IModel, IModelReplica } from '../types.ts';

import { makeModelVersion } from './makeModelVersion.ts';

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
  serviceVersion: Schema.String,
});

export function makeReplica<
  SOURCE_MODEL extends IModel,
  SERVICE_NAME extends string,
  SERVICE_VERSION extends string,
>(props: {
  sourceModel: SOURCE_MODEL;
  serviceName: SERVICE_NAME;
  serviceVersion: SERVICE_VERSION;
}): IModelReplica<SOURCE_MODEL, SERVICE_NAME, SOURCE_MODEL['version']> & {
  readonly serviceVersion: SERVICE_VERSION;
};

export function makeReplica(props: {
  sourceModel: IModel;
  serviceName: string;
  serviceVersion: string;
}): unknown {
  assertSameCoreInstance({ value: props.sourceModel, expected: Model, kind: 'Model' });
  const { sourceModel, serviceName, serviceVersion } = Schema.decodeUnknownSync(
    MakeReplicaPropsSchema,
    {
      onExcessProperty: 'error',
    },
  )(props);

  const replica = makeModelVersion(
    defineModel({
      name: sourceModel.modelName,
      abbreviation: sourceModel.abbreviation,
    }),
    {
      attributes: sourceModel.attributes,
      propertiesShape: {
        ...sourceModel.propertiesShape,
        deletedAt: primitives.date({ nullable: true }),
        serviceIndex: primitives.integer({ nullable: true }),
      },
      indexes: sourceModel.indexes,
      version: sourceModel.version,
    },
  );
  Model.markReplica(replica, {
    sourceModel,
    serviceName,
    serviceVersion,
  });
  return replica;
}
