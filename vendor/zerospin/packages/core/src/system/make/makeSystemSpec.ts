import { Schema } from 'effect';
import { mapValues } from 'es-toolkit';

import { AggregateSchema } from '../../aggregate/make/makeAggregateVersion.ts';
import type { IContract } from '../../contracts/types.ts';
import type { ISystem, ISystemSpec } from '../types.ts';

export function makeSystemSpec<
  SYSTEM extends Pick<ISystem, 'name' | 'aggregates' | 'services' | 'machines'>,
>(props: { system: SYSTEM }): ISystemSpec {
  const { system } = props;

  const spec: ISystemSpec = {
    systemName: system.name,
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
        actors: mapValues(aggregate.actors, actor => ({
          contracts: mapValues(actor.contracts, contract => ({
            commandName: contract.spec.commandName,
            failureSchemas: failureSchemas(contract),
            version: contract.spec.version,
            models: structuredClone(contract.spec.models),
            payloadShape: structuredClone(contract.spec.payloadShape),
            failureJsonSchema: structuredClone(contract.spec.failureJsonSchema),
          })),
          name: actor.name,
          models: mapValues(actor.db.models, model => ({
            modelName: model.modelName,
            version: model.version,
          })),
          version: actor.version,
          authentication:
            actor.authentication === 'none'
              ? ('none' as const)
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
          selections: mapValues(actor.selections, filter => ({
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
          name: actor.name,
          models: mapValues(actor.db.models, model => ({
            modelName: model.modelName,
            version: model.version,
          })),
          version: actor.version,
          authentication:
            actor.authentication === 'none'
              ? ('none' as const)
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
          selections: mapValues(actor.selections, filter => ({
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
        })),
        queries: mapValues(service.queries, query => ({
          name: query.name,
          serviceName: query.serviceName,
          paramsJsonSchema: Schema.toJsonSchemaDocument(query.paramsSchema),
        })),
      })),
    ),
    machines: mapValues(system.machines, machine => ({
      sourceKind: Schema.is(AggregateSchema)(machine.source)
        ? ('aggregate' as const)
        : ('service' as const),
      sourceName: machine.source.name,
      sourceVersion: machine.source.version,
      selections: mapValues(machine.selections, selection => ({
        modelName: selection.model.modelName,
        query: structuredClone(selection.query),
      })),
      contracts: mapValues(machine.contracts, binding => ({
        targetKind: Schema.is(AggregateSchema)(binding.target)
          ? ('aggregate' as const)
          : ('service' as const),
        targetName: binding.target.name,
        targetVersion: binding.target.version,
        contract: {
          commandName: binding.contract.spec.commandName,
          failureSchemas: failureSchemas(binding.contract),
          version: binding.contract.spec.version,
          models: structuredClone(binding.contract.spec.models),
          payloadShape: structuredClone(binding.contract.spec.payloadShape),
          failureJsonSchema: structuredClone(
            binding.contract.spec.failureJsonSchema,
          ),
        },
      })),
      states: mapValues(machine.states, state =>
        Schema.toJsonSchemaDocument(state.schema),
      ),
      routes: mapValues(machine.routes, route => {
        if (typeof route !== 'object' || route === null) {
          throw new TypeError('Machine route must be an object');
        }
        return {
          work:
            'command' in route
              ? ('command' as const)
              : 'onActivation' in route
                ? ('activation' as const)
                : 'wakeAt' in route
                  ? ('waiting' as const)
                  : ('idle' as const),
          onCommand: 'onCommand' in route,
        };
      }),
    })),
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
