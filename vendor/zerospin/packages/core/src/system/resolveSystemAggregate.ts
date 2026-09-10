import { Effect, Schema } from 'effect';

import type {
  IAnyAggregate,
  IAnyAuthoredAggregate,
} from '../aggregate/types.ts';
import { Model } from '../models/makeModel.ts';
import type { IModel } from '../models/types.ts';
import type { IAnyService } from '../service/types.ts';

export function resolveSystemAggregate(props: {
  name: string;
  aggregateName: string;
  aggregate: IAnyAuthoredAggregate;
  services: Record<string, Readonly<Record<string, IAnyService>>>;
  serviceNameBySourceModel: Map<IModel, string>;
}): IAnyAggregate {
  const { aggregateName, aggregate, services, serviceNameBySourceModel } =
    props;

  Schema.decodeUnknownSync(
    Schema.Struct({ name: Schema.Literal(aggregateName) }),
    { onExcessProperty: 'ignore' },
  )(aggregate);

  Schema.decodeUnknownSync(
    Schema.Unknown.check(
      Schema.makeFilter(() => {
        for (const [modelName, model] of Object.entries(aggregate.models)) {
          if (Model.isReplica(model)) {
            const sourceModel = model.sourceModel;
            const sourceServiceName = model.serviceName;
            const sourceService =
              services[sourceServiceName]?.[
                aggregate.services[sourceServiceName] ?? ''
              ];
            if (
              sourceService === undefined ||
              sourceService.models[model.modelName] !== sourceModel
            ) {
              return {
                path: [modelName],
                issue: `must replicate the exact source model "${String(sourceServiceName)}.${model.modelName}"`,
              };
            }
            continue;
          }
          const sourceServiceName = serviceNameBySourceModel.get(model);
          if (sourceServiceName !== undefined) {
            return {
              path: [modelName],
              issue: `must use makeReplica for source model "${sourceServiceName}.${model.modelName}"`,
            };
          }
        }
        for (const [serviceName, serviceVersion] of Object.entries(
          aggregate.services,
        )) {
          const service = services[serviceName]?.[serviceVersion];
          if (service === undefined) {
            return `aggregate snapshot "${aggregate.version}" references missing service "${serviceName}"`;
          }
        }
        for (const [modelName, model] of Object.entries(aggregate.models)) {
          if (!Model.isReplica(model)) {
            continue;
          }
          const serviceName = model.serviceName;
          const serviceVersion = aggregate.services[serviceName];
          if (serviceVersion === undefined) {
            return `aggregate snapshot "${aggregate.version}" must pin service "${serviceName}" for replica "${modelName}"`;
          }
          const service = services[serviceName]?.[serviceVersion];
          const sourceModelVersion =
            service?.models[model.sourceModel.modelName]?.version;
          if (sourceModelVersion !== model.version) {
            return `replica "${modelName}@${model.version}" in aggregate snapshot "${aggregate.version}" must exactly match model "${serviceName}.${model.sourceModel.modelName}" in pinned service snapshot "${serviceVersion}" (model version "${String(sourceModelVersion)}")`;
          }
        }
        return true;
      }),
    ),
  )(aggregate.models);

  const resolvedAggregate = {
    ...aggregate,
    getVersion: (snapshotVersion: string) =>
      aggregate.getVersion(snapshotVersion).pipe(
        Effect.map(sliced =>
          resolveSystemAggregate({
            ...props,
            aggregate: sliced,
          }),
        ),
      ),
  };

  return resolvedAggregate;
}
