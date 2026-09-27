import { Schema } from 'effect';

import type { IModel, IModelReplica } from './types.ts';

const replicaMetadata = new WeakMap<
  object,
  Readonly<{
    sourceModel: IModel;
    serviceName: string;
    serviceVersion: string;
  }>
>();

export class Model {
  get sourceModel(): IModel | undefined {
    return replicaMetadata.get(this)?.sourceModel;
  }

  get serviceName(): string | undefined {
    return replicaMetadata.get(this)?.serviceName;
  }

  get serviceVersion(): string | undefined {
    return replicaMetadata.get(this)?.serviceVersion;
  }

  static markReplica(
    model: IModel,
    props: {
      sourceModel: IModel;
      serviceName: string;
      serviceVersion: string;
    },
  ): IModel {
    const { sourceModel, serviceName, serviceVersion } = props;
    if (replicaMetadata.has(model)) {
      throw new Error('Model is already marked as a replica');
    }
    replicaMetadata.set(model, { sourceModel, serviceName, serviceVersion });
    return model;
  }

  static isReplica(model: IModel): model is IModelReplica {
    return replicaMetadata.has(model);
  }
}

export function defineModel<
  const NAME extends string,
  const ABBREVIATION extends string,
>(props: { name: NAME; abbreviation: ABBREVIATION }) {
  Schema.decodeUnknownSync(
    Schema.Struct({ name: Schema.String, abbreviation: Schema.String }),
    {
      onExcessProperty: 'error',
    },
  )(props);
  return { name: props.name, abbreviation: props.abbreviation };
}
