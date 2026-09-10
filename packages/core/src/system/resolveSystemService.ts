import { Schema } from 'effect';

import type { IModel } from '../models/types.ts';
import type { IAnyService } from '../service/types.ts';

export function resolveSystemService(props: {
  name: string;
  serviceName: string;
  service: IAnyService;
  serviceNameBySourceModel: Map<IModel, string>;
}): IAnyService {
  const { name, serviceName, service, serviceNameBySourceModel } = props;

  Schema.decodeUnknownSync(
    Schema.Struct({ name: Schema.Literal(serviceName) }),
    { onExcessProperty: 'ignore' },
  )(service);

  Schema.decodeUnknownSync(
    Schema.Record(
      Schema.String,
      Schema.Struct({
        controller: Schema.Struct({
          systemName: Schema.Literal(name),
        }),
      }),
    ),
    { onExcessProperty: 'ignore' },
  )(service.frontends);

  Schema.decodeUnknownSync(
    Schema.Unknown.check(
      Schema.makeFilter(() => {
        for (const [modelName, model] of Object.entries(service.models)) {
          const priorServiceName = serviceNameBySourceModel.get(model);
          if (
            priorServiceName !== undefined &&
            priorServiceName !== serviceName
          ) {
            return {
              path: [modelName],
              issue: `reuses a source model already owned by service "${priorServiceName}"`,
            };
          }
        }
        return true;
      }),
    ),
  )(service.models);

  for (const model of Object.values(service.models)) {
    serviceNameBySourceModel.set(model, serviceName);
  }

  return service;
}
