import { Schema } from 'effect';
import { mapValues } from 'es-toolkit';

import type { IAuthentication } from '../authentication/types.ts';
import { makeFrontendControllerSpec } from '../frontendController/makeFrontendControllerSpec.ts';

import type { ISystem, ISystemSpec } from './types.ts';

export function makeSystemSpec<
  SYSTEM extends Pick<ISystem, 'name' | 'aggregates' | 'services'> & {
    authentication: readonly IAuthentication[];
  },
>(props: { system: SYSTEM }): ISystemSpec {
  const { system } = props;

  const spec: ISystemSpec = {
    systemName: system.name,
    authentication: system.authentication
      .map(definition => structuredClone(definition.spec))
      .toSorted((left, right) => left.version.localeCompare(right.version)),
    aggregates: mapValues(system.aggregates, versions =>
      mapValues(versions, aggregate => ({
        name: aggregate.name,
        version: aggregate.version,
        services: { ...aggregate.services },
        models: mapValues(aggregate.models, model => ({
          modelName: model.modelName,
          abbreviation: model.abbreviation,
          version: model.version,
          properties: structuredClone(model.spec.propertiesShape),
          indexes: model.indexes.map(index => ({
            ...index,
            columns: [...index.columns],
          })),
        })),
        contracts: mapValues(aggregate.contracts, binding => ({
          commandName: binding.contract.spec.commandName,
          version: binding.contract.spec.version,
          models: structuredClone(binding.contract.spec.models),
          payloadShape: structuredClone(binding.contract.spec.payloadShape),
        })),
        selections: mapValues(aggregate.selections, selection => ({
          modelName: selection.model.modelName,
        })),
      })),
    ),
    services: mapValues(system.services, versions =>
      mapValues(versions, service => ({
        name: service.name,
        version: service.version,
        historicalDefinitions: service.historicalDefinitions.map(
          definition => ({
            version: definition.version,
            models: { ...definition.models },
            contracts: { ...definition.contracts },
          }),
        ),
        models: mapValues(service.models, model => ({
          modelName: model.modelName,
          abbreviation: model.abbreviation,
          version: model.version,
          properties: structuredClone(model.spec.propertiesShape),
          indexes: model.indexes.map(index => ({
            ...index,
            columns: [...index.columns],
          })),
        })),
        contracts: mapValues(service.contracts, contract => ({
          commandName: contract.commandName,
          version: contract.version,
          models: structuredClone(contract.spec.models),
          payloadShape: structuredClone(contract.spec.payloadShape),
        })),
        queries: mapValues(service.queries, query => ({
          name: query.name,
          serviceName: query.serviceName,
          paramsJsonSchema: Schema.toJsonSchemaDocument(query.paramsSchema),
        })),
        frontends: mapValues(service.frontends, binding => ({
          name: binding.name,
          models: mapValues(binding.models, (model, modelKey) => ({
            modelName: model.modelName,
            hasProjectionAdapter:
              binding.projectionAdapters[modelKey] !== undefined,
          })),
          contracts: {},
          controller: makeFrontendControllerSpec(binding.controller),
        })),
      })),
    ),
  };
  return spec;
}
