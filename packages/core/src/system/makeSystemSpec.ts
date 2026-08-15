import { JSONSchema } from 'effect';
import { mapValues } from 'es-toolkit';

import { makeFrontendControllerSpec } from '../frontendController/makeFrontendControllerSpec.ts';
import { encodeShape } from '../models/encodeShape.ts';

import type { ISystem, ISystemSpec } from './types.ts';

export function makeSystemSpec<
  SYSTEM extends Pick<
    ISystem,
    'name' | 'version' | 'authentication' | 'aggregates' | 'services'
  >,
>(props: { system: SYSTEM }): ISystemSpec {
  const { system } = props;

  return {
    systemName: system.name,
    version: system.version,
    authentication: {
      signature: {
        ...system.authentication.signature.spec,
        historicalDefinitions:
          system.authentication.signature.spec.historicalDefinitions.map(
            definition => ({ ...definition, hasDirectAdapter: true }),
          ),
      },
    },
    aggregates: mapValues(system.aggregates, aggregate => ({
      name: aggregate.name,
      models: mapValues(aggregate.models, model => ({
        modelName: model.modelName,
        abbreviation: model.abbreviation,
        version: model.version,
        properties: encodeShape(model.propertiesShape),
        indexes: model.indexes,
        historicalDefinitions: model.historicalDefinitions
          .toSorted((left, right) => left.version.localeCompare(right.version))
          .map(definition => ({
            modelName: definition.modelName,
            abbreviation: definition.abbreviation,
            version: definition.version,
            hasDirectAdapter: typeof definition.adaptResource === 'function',
            properties: encodeShape({
              ...model.metadata,
              ...definition.attributes,
            }),
            indexes: definition.indexes,
          })),
      })),
      contracts: mapValues(aggregate.contracts, contract => ({
        commandName: contract.commandName,
        version: contract.version,
        payloadJsonSchema: contract.spec.payloadJsonSchema,
        historicalDefinitions: contract.spec.historicalDefinitions.map(
          definition => ({
            ...definition,
            hasDirectAdapter: contract.historicalDefinitions.some(
              historicalDefinition =>
                historicalDefinition.version === definition.version &&
                typeof historicalDefinition.adaptPayload === 'function',
            ),
          }),
        ),
      })),
      mutationAdapters: mapValues(
        aggregate.mutationAdapters ?? {},
        (operationAdapters, sourceModelName) =>
          mapValues(operationAdapters, (edges, operationName) => {
            if (
              operationName !== 'create' &&
              operationName !== 'delete' &&
              operationName !== 'move' &&
              operationName !== 'replicateResource' &&
              operationName !== 'update'
            ) {
              throw new Error(
                `makeSystemSpec: unsupported aggregate mutation adapter operation "${String(operationName)}"`,
              );
            }
            if (edges === undefined) {
              throw new Error(
                `makeSystemSpec: aggregate mutation adapter ${String(sourceModelName)}.${operationName} is undefined`,
              );
            }
            return edges.map((edge, edgeIndex) => {
              const sourceJsonSchema = JSONSchema.make(edge.source);
              const sourceProperties = Reflect.get(
                sourceJsonSchema,
                'properties',
              );
              const sourceModelVersionProperty =
                typeof sourceProperties === 'object' &&
                sourceProperties !== null
                  ? Reflect.get(sourceProperties, 'modelVersion')
                  : undefined;
              const sourceModelVersions =
                typeof sourceModelVersionProperty === 'object' &&
                sourceModelVersionProperty !== null
                  ? Reflect.get(sourceModelVersionProperty, 'enum')
                  : undefined;
              const sourceModelVersion = Array.isArray(sourceModelVersions)
                ? sourceModelVersions[0]
                : undefined;
              if (typeof sourceModelVersion !== 'string') {
                throw new Error(
                  `makeSystemSpec: aggregate mutation adapter ${String(sourceModelName)}.${operationName}[${edgeIndex}] has no source modelVersion`,
                );
              }

              if (edge.destination === null) {
                return {
                  source: {
                    modelName: String(sourceModelName),
                    modelVersion: sourceModelVersion,
                    operationName,
                    jsonSchema: sourceJsonSchema,
                  },
                  destination: null,
                };
              }

              const destinationJsonSchema = JSONSchema.make(edge.destination);
              const destinationProperties = Reflect.get(
                destinationJsonSchema,
                'properties',
              );
              const destinationModelNameProperty =
                typeof destinationProperties === 'object' &&
                destinationProperties !== null
                  ? Reflect.get(destinationProperties, 'modelName')
                  : undefined;
              const destinationModelVersionProperty =
                typeof destinationProperties === 'object' &&
                destinationProperties !== null
                  ? Reflect.get(destinationProperties, 'modelVersion')
                  : undefined;
              const destinationModelNames =
                typeof destinationModelNameProperty === 'object' &&
                destinationModelNameProperty !== null
                  ? Reflect.get(destinationModelNameProperty, 'enum')
                  : undefined;
              const destinationModelVersions =
                typeof destinationModelVersionProperty === 'object' &&
                destinationModelVersionProperty !== null
                  ? Reflect.get(destinationModelVersionProperty, 'enum')
                  : undefined;
              const destinationModelName = Array.isArray(destinationModelNames)
                ? destinationModelNames[0]
                : undefined;
              const destinationModelVersion = Array.isArray(
                destinationModelVersions,
              )
                ? destinationModelVersions[0]
                : undefined;
              if (
                typeof destinationModelName !== 'string' ||
                typeof destinationModelVersion !== 'string'
              ) {
                throw new Error(
                  `makeSystemSpec: aggregate mutation adapter ${String(sourceModelName)}.${operationName}[${edgeIndex}] has no destination identity`,
                );
              }
              return {
                source: {
                  modelName: String(sourceModelName),
                  modelVersion: sourceModelVersion,
                  operationName,
                  jsonSchema: sourceJsonSchema,
                },
                destination: {
                  modelName: destinationModelName,
                  modelVersion: destinationModelVersion,
                  operationName,
                  jsonSchema: destinationJsonSchema,
                },
              };
            });
          }),
      ),
      selections: mapValues(aggregate.selections, selection => ({
        modelName: selection.model.modelName,
      })),
      queries: mapValues(aggregate.queries, query => ({
        name: query.name,
        serviceName: query.serviceName,
        paramsJsonSchema: JSONSchema.make(query.paramsSchema),
      })),
      frontends: mapValues(aggregate.frontends, binding => ({
        name: binding.name,
        models: mapValues(binding.models, (model, modelKey) => ({
          modelName: model.modelName,
          hasProjectionAdapter:
            binding.projectionAdapters[modelKey] !== undefined,
        })),
        contracts: mapValues(binding.contracts, (contract, contractKey) => ({
          commandName: contract.commandName,
          version: contract.version,
          hasAuthoritativeAdapter:
            binding.contractAdapters[contractKey] !== undefined,
        })),
        controller: makeFrontendControllerSpec(binding.controller),
      })),
    })),
    services: mapValues(system.services, service => ({
      name: service.name,
      models: mapValues(service.models, model => ({
        modelName: model.modelName,
        abbreviation: model.abbreviation,
        version: model.version,
        properties: encodeShape(model.propertiesShape),
        indexes: model.indexes,
        historicalDefinitions: model.historicalDefinitions
          .toSorted((left, right) => left.version.localeCompare(right.version))
          .map(definition => ({
            modelName: definition.modelName,
            abbreviation: definition.abbreviation,
            version: definition.version,
            hasDirectAdapter: typeof definition.adaptResource === 'function',
            properties: encodeShape({
              ...model.metadata,
              ...definition.attributes,
            }),
            indexes: definition.indexes,
          })),
      })),
      contracts: mapValues(service.contracts, contract => ({
        commandName: contract.commandName,
        version: contract.version,
        payloadJsonSchema: contract.spec.payloadJsonSchema,
        historicalDefinitions: contract.spec.historicalDefinitions.map(
          definition => ({
            ...definition,
            hasDirectAdapter: contract.historicalDefinitions.some(
              historicalDefinition =>
                historicalDefinition.version === definition.version &&
                typeof historicalDefinition.adaptPayload === 'function',
            ),
          }),
        ),
      })),
      mutationAdapters: mapValues(
        service.mutationAdapters ?? {},
        (operationAdapters, sourceModelName) =>
          mapValues(operationAdapters, (edges, operationName) => {
            if (
              operationName !== 'create' &&
              operationName !== 'delete' &&
              operationName !== 'move' &&
              operationName !== 'replicateResource' &&
              operationName !== 'update'
            ) {
              throw new Error(
                `makeSystemSpec: unsupported service mutation adapter operation "${String(operationName)}"`,
              );
            }
            if (edges === undefined) {
              throw new Error(
                `makeSystemSpec: service mutation adapter ${String(sourceModelName)}.${operationName} is undefined`,
              );
            }
            return edges.map((edge, edgeIndex) => {
              const sourceJsonSchema = JSONSchema.make(edge.source);
              const sourceProperties = Reflect.get(
                sourceJsonSchema,
                'properties',
              );
              const sourceModelVersionProperty =
                typeof sourceProperties === 'object' &&
                sourceProperties !== null
                  ? Reflect.get(sourceProperties, 'modelVersion')
                  : undefined;
              const sourceModelVersions =
                typeof sourceModelVersionProperty === 'object' &&
                sourceModelVersionProperty !== null
                  ? Reflect.get(sourceModelVersionProperty, 'enum')
                  : undefined;
              const sourceModelVersion = Array.isArray(sourceModelVersions)
                ? sourceModelVersions[0]
                : undefined;
              if (typeof sourceModelVersion !== 'string') {
                throw new Error(
                  `makeSystemSpec: service mutation adapter ${String(sourceModelName)}.${operationName}[${edgeIndex}] has no source modelVersion`,
                );
              }

              if (edge.destination === null) {
                return {
                  source: {
                    modelName: String(sourceModelName),
                    modelVersion: sourceModelVersion,
                    operationName,
                    jsonSchema: sourceJsonSchema,
                  },
                  destination: null,
                };
              }

              const destinationJsonSchema = JSONSchema.make(edge.destination);
              const destinationProperties = Reflect.get(
                destinationJsonSchema,
                'properties',
              );
              const destinationModelNameProperty =
                typeof destinationProperties === 'object' &&
                destinationProperties !== null
                  ? Reflect.get(destinationProperties, 'modelName')
                  : undefined;
              const destinationModelVersionProperty =
                typeof destinationProperties === 'object' &&
                destinationProperties !== null
                  ? Reflect.get(destinationProperties, 'modelVersion')
                  : undefined;
              const destinationModelNames =
                typeof destinationModelNameProperty === 'object' &&
                destinationModelNameProperty !== null
                  ? Reflect.get(destinationModelNameProperty, 'enum')
                  : undefined;
              const destinationModelVersions =
                typeof destinationModelVersionProperty === 'object' &&
                destinationModelVersionProperty !== null
                  ? Reflect.get(destinationModelVersionProperty, 'enum')
                  : undefined;
              const destinationModelName = Array.isArray(destinationModelNames)
                ? destinationModelNames[0]
                : undefined;
              const destinationModelVersion = Array.isArray(
                destinationModelVersions,
              )
                ? destinationModelVersions[0]
                : undefined;
              if (
                typeof destinationModelName !== 'string' ||
                typeof destinationModelVersion !== 'string'
              ) {
                throw new Error(
                  `makeSystemSpec: service mutation adapter ${String(sourceModelName)}.${operationName}[${edgeIndex}] has no destination identity`,
                );
              }
              return {
                source: {
                  modelName: String(sourceModelName),
                  modelVersion: sourceModelVersion,
                  operationName,
                  jsonSchema: sourceJsonSchema,
                },
                destination: {
                  modelName: destinationModelName,
                  modelVersion: destinationModelVersion,
                  operationName,
                  jsonSchema: destinationJsonSchema,
                },
              };
            });
          }),
      ),
      queries: mapValues(service.queries, query => ({
        name: query.name,
        serviceName: query.serviceName,
        paramsJsonSchema: JSONSchema.make(query.paramsSchema),
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
  };
}
