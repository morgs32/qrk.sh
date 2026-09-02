import { primitives } from '@zerospin/schema';
import { Effect } from 'effect';

import { makeModel } from './makeModel.ts';
import type { IModel, IModelReplica } from './types.ts';

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
  const { sourceModel, serviceName } = props;
  if ('sourceModel' in sourceModel) {
    throw new Error('makeReplica sourceModel must be an authored model');
  }

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
  Object.defineProperties(replica, {
    sourceModel: {
      configurable: false,
      enumerable: true,
      value: sourceModel,
      writable: false,
    },
    serviceName: {
      configurable: false,
      enumerable: true,
      value: serviceName,
      writable: false,
    },
  });

  return replica;
}
