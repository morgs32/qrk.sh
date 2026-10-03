import { Schema } from 'effect';
import { mapValues } from 'es-toolkit';

import type { IContract } from '../../contracts/types.ts';
import type { ISystem, ISystemSpec } from '../types.ts';
export function makeSystemSpec<
  SYSTEM extends Pick<ISystem, 'name' | 'aggregates' | 'services' | 'agents'>,
>(props: { system: SYSTEM }): ISystemSpec {
  const { system } = props;
  const spec: ISystemSpec = {
    systemName: system.name,
    agents: mapValues(system.agents, (agent, name) => ({
      name,
      aggregateName: agent.aggregate.name,
      aggregateVersion: agent.aggregate.version,
      actorName: agent.actor.name,
      actorVersion: agent.actor.version,
      query: structuredClone(agent.query),
      models: mapValues(agent.actor.db.models, model => ({
        modelName: model.modelName,
        abbreviation: model.abbreviation,
        version: model.version,
        properties: structuredClone(model.spec.propertiesShape),
        indexes: model.indexes.map(index => ({
          ...index,
          columns: [...index.columns],
        })),
      })),
    })),
    aggregates: mapValues(system.aggregates, versions =>
      mapValues(versions, aggregate => ({
        name: aggregate.name,
        version: aggregate.version,
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
        actors: mapValues(aggregate.actors, actor => ({
          contracts: mapValues(actor.contracts, contract => ({
            ...asyncSpec(contract),
            commandName: contract.spec.commandName,
            failureSchemas: failureSchemas(contract),
            version: contract.spec.version,
            models: structuredClone(contract.spec.models),
            payloadShape: structuredClone(contract.spec.payloadShape),
            failureJsonSchema: structuredClone(contract.spec.failureJsonSchema),
            resultJsonSchema: structuredClone(contract.spec.resultJsonSchema),
          })),
          name: actor.name,
          models: mapValues(actor.db.models, model => ({
            modelName: model.modelName,
            version: model.version,
          })),
          version: actor.version,
          authentication:
            typeof actor.authentication === 'string'
              ? actor.authentication
              : {
                  credentialsJsonSchema: Schema.toJsonSchemaDocument(
                    actor.authentication.credentialsSchema,
                  ),
                },
          identity: {
            claimsJsonSchema: Schema.toJsonSchemaDocument(
              actor.identity.claimsSchema,
            ),
            identityJsonSchema: Schema.toJsonSchemaDocument(
              actor.identity.identitySchema,
            ),
            pattern: actor.identity.pattern.source,
          },
          selections: mapValues(actor.capturedSelections, filter => ({
            modelName: filter.model.modelName,
            query: structuredClone(filter.query),
          })),
        })),
      })),
    ),
    services: mapValues(system.services, versions =>
      mapValues(versions, service => ({
        name: service.name,
        version: service.version,
        actors: mapValues(service.actors, actor => ({
          contracts: mapValues(actor.contracts, contract => ({
            ...asyncSpec(contract),
            commandName: contract.spec.commandName,
            failureSchemas: failureSchemas(contract),
            version: contract.spec.version,
            models: structuredClone(contract.spec.models),
            payloadShape: structuredClone(contract.spec.payloadShape),
            failureJsonSchema: structuredClone(contract.spec.failureJsonSchema),
            resultJsonSchema: structuredClone(contract.spec.resultJsonSchema),
          })),
          name: actor.name,
          models: mapValues(actor.db.models, model => ({
            modelName: model.modelName,
            version: model.version,
          })),
          version: actor.version,
          authentication:
            typeof actor.authentication === 'string'
              ? actor.authentication
              : {
                  credentialsJsonSchema: Schema.toJsonSchemaDocument(
                    actor.authentication.credentialsSchema,
                  ),
                },
          identity: {
            claimsJsonSchema: Schema.toJsonSchemaDocument(
              actor.identity.claimsSchema,
            ),
            identityJsonSchema: Schema.toJsonSchemaDocument(
              actor.identity.identitySchema,
            ),
            pattern: actor.identity.pattern.source,
          },
          selections: mapValues(actor.capturedSelections, filter => ({
            modelName: filter.model.modelName,
            query: structuredClone(filter.query),
          })),
        })),
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
          failureSchemas: failureSchemas(contract),
          version: contract.version,
          models: structuredClone(contract.spec.models),
          payloadShape: structuredClone(contract.spec.payloadShape),
          failureJsonSchema: structuredClone(contract.spec.failureJsonSchema),
          resultJsonSchema: structuredClone(contract.spec.resultJsonSchema),
        })),
        queries: mapValues(service.queries, query => ({
          name: query.name,
          serviceName: query.serviceName,
          paramsJsonSchema: Schema.toJsonSchemaDocument(query.paramsSchema),
        })),
      })),
    ),
  };
  return spec;
}
/** Lock every historical failure schema, including versions selected by older clients. */
function failureSchemas(
  contract: IContract,
): Readonly<Record<string, unknown>> {
  const schemas: Record<string, unknown> = {};
  let version: IContract | undefined = contract;
  while (version !== undefined) {
    schemas[version.version] = structuredClone(version.spec.failureJsonSchema);
    version = version.previous;
  }
  return schemas;
}

function asyncSpec(contract: IContract) {
  const mapped =
    contract.mapping === undefined
      ? {}
      : { original: structuredClone(contract.mapping.original.spec) };
  const declaration = contract.async;
  return declaration === undefined
    ? mapped
    : {
        ...mapped,
        async: {
          externalJsonSchema: Schema.toJsonSchemaDocument(
            declaration.external.result,
          ),
          timeoutMs: declaration.external.timeoutMs,
          retryDelayMs: declaration.external.retryDelayMs,
        },
      };
}
