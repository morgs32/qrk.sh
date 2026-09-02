import { primitives } from '@zerospin/schema';
import { Effect, Schema } from 'effect';

import { makeModel, Model } from './makeModel.ts';
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
});

export function makeReplica<
  SOURCE_MODEL extends IModel,
  SERVICE_NAME extends string,
>(props: {
  sourceModel: SOURCE_MODEL;
  serviceName: SERVICE_NAME;
}): IModelReplica<SOURCE_MODEL, SERVICE_NAME>;

export function makeReplica(props: {
  sourceModel: IModel;
  serviceName: string;
}): unknown {
  Schema.decodeUnknownSync(MakeReplicaPropsSchema, {
    onExcessProperty: 'error',
  })(props);
  const { sourceModel, serviceName } = props;

  const deletedAt = primitives.date({ nullable: true });
  const historicalDefinitions = sourceModel.historicalDefinitions.map(
    definition => ({
      abbreviation: definition.abbreviation,
      attributes: definition.attributes,
      indexes: definition.indexes,
      modelName: definition.modelName,
      propertiesShape: {
        ...definition.propertiesShape,
        deletedAt,
      },
      version: definition.version,
      adaptResource: (props: {
        resource: Readonly<Record<string, unknown>>;
      }) => {
        const { deletedAt: resourceDeletedAt, ...sourceResource } =
          props.resource;
        return definition
          .adaptResource({ resource: sourceResource })
          .pipe(
            Effect.map(adaptedResource =>
              typeof adaptedResource === 'object' && adaptedResource !== null
                ? { ...adaptedResource, deletedAt: resourceDeletedAt }
                : adaptedResource,
            ),
          );
      },
    }),
  );
  const replica = makeModel(
    {
      abbreviation: sourceModel.abbreviation,
      modelName: sourceModel.modelName,
      attributes: sourceModel.attributes,
      propertiesShape: {
        ...sourceModel.propertiesShape,
        deletedAt,
      },
      indexes: sourceModel.indexes,
      version: sourceModel.version,
    },
    historicalDefinitions,
  );
  return Model.markReplica(replica, {
    sourceModel,
    serviceName,
  });
}
