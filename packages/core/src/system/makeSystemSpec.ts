import { JSONSchema } from 'effect';
import { mapValues } from 'es-toolkit';

import { encodeShape } from '../models/encodeShape.ts';
import { primitives } from '../models/primitives.ts';

import type { ISystem, ISystemSpec } from './types.ts';

/**
 * Serializes the complete authored system definition used by deploy
 * compatibility and generation selection.
 *
 * The repetition below is deliberate:
 * 1. Account and service controllers own independent complete definitions.
 * 2. Actor controllers repeat their bound models and frontend controllers.
 * 3. Every current model repeats its complete historical definitions.
 * 4. Mutation adapter functions are omitted, but both adjacent schemas and
 *    their identities remain available to compatibility and replay planning.
 */
export function makeSystemSpec<
  SYSTEM extends Pick<
    ISystem,
    'name' | 'version' | 'accountControllers' | 'serviceControllers'
  >,
>(props: { system: SYSTEM }): ISystemSpec {
  const { system } = props;

  return {
    systemName: system.name,
    version: system.version,
    accountControllers: mapValues(
      system.accountControllers,
      accountController => ({
        name: accountController.name,
        version: accountController.version,
        models: mapValues(accountController.models, model => ({
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
              properties: encodeShape({
                id: primitives.primaryKey({
                  abbreviation: definition.abbreviation,
                }),
                modelName: primitives.text({ nullable: false }),
                createdAt: primitives.date({ nullable: false }),
                updatedAt: primitives.date({ nullable: false }),
                version: primitives.text({ nullable: false }),
                ...definition.attributes,
              }),
              indexes: definition.indexes,
            })),
        })),
        contracts: mapValues(accountController.contracts, contract => ({
          commandName: contract.commandName,
          version: contract.version,
          payloadJsonSchema: contract.spec.payloadJsonSchema,
          mutationsJsonSchema:
            contract.mutations === null
              ? null
              : JSONSchema.make(contract.mutations),
        })),
        mutationAdapters: mapValues(
          accountController.mutationAdapters ?? {},
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
                  `makeSystemSpec: unsupported account mutation adapter operation "${String(operationName)}"`,
                );
              }
              if (edges === undefined) {
                throw new Error(
                  `makeSystemSpec: account mutation adapter ${String(sourceModelName)}.${operationName} is undefined`,
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
                    `makeSystemSpec: account mutation adapter ${String(sourceModelName)}.${operationName}[${edgeIndex}] has no source modelVersion`,
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

                const destinationJsonSchema = JSONSchema.make(
                  edge.destination,
                );
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
                const destinationModelName = Array.isArray(
                  destinationModelNames,
                )
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
                    `makeSystemSpec: account mutation adapter ${String(sourceModelName)}.${operationName}[${edgeIndex}] has no destination identity`,
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
        actorControllers: mapValues(
          accountController.actorControllers,
          actorController => ({
            name: actorController.name,
            version: actorController.version,
            models: mapValues(actorController.models, model => ({
              modelName: model.modelName,
              abbreviation: model.abbreviation,
              version: model.version,
              properties: encodeShape(model.propertiesShape),
              indexes: model.indexes,
              historicalDefinitions: model.historicalDefinitions
                .toSorted((left, right) =>
                  left.version.localeCompare(right.version),
                )
                .map(definition => ({
                  modelName: definition.modelName,
                  abbreviation: definition.abbreviation,
                  version: definition.version,
                  properties: encodeShape({
                    id: primitives.primaryKey({
                      abbreviation: definition.abbreviation,
                    }),
                    modelName: primitives.text({ nullable: false }),
                    createdAt: primitives.date({ nullable: false }),
                    updatedAt: primitives.date({ nullable: false }),
                    version: primitives.text({ nullable: false }),
                    ...definition.attributes,
                  }),
                  indexes: definition.indexes,
                })),
            })),
            selections: mapValues(actorController.selections, selection => ({
              modelName: selection.model.modelName,
            })),
            queries: mapValues(actorController.api, query => ({
              name: query.name,
              serviceName: query.serviceName,
              paramsJsonSchema: JSONSchema.make(query.paramsSchema),
            })),
            frontends: mapValues(actorController.frontends, binding => ({
              name: binding.name,
              frontendController: {
                accountName: binding.frontendController.accountName,
                actorName: binding.frontendController.actorName,
                frontendName: binding.frontendController.frontendName,
                version: binding.frontendController.version,
                models: mapValues(
                  binding.frontendController.models,
                  model => ({
                    modelName: model.modelName,
                    abbreviation: model.abbreviation,
                    version: model.version,
                    properties: encodeShape(model.propertiesShape),
                    indexes: model.indexes,
                    historicalDefinitions: model.historicalDefinitions
                      .toSorted((left, right) =>
                        left.version.localeCompare(right.version),
                      )
                      .map(definition => ({
                        modelName: definition.modelName,
                        abbreviation: definition.abbreviation,
                        version: definition.version,
                        properties: encodeShape({
                          id: primitives.primaryKey({
                            abbreviation: definition.abbreviation,
                          }),
                          modelName: primitives.text({ nullable: false }),
                          createdAt: primitives.date({ nullable: false }),
                          updatedAt: primitives.date({ nullable: false }),
                          version: primitives.text({ nullable: false }),
                          ...definition.attributes,
                        }),
                        indexes: definition.indexes,
                      })),
                  }),
                ),
                contracts: mapValues(
                  binding.frontendController.contracts,
                  contract => ({
                    commandName: contract.commandName,
                    version: contract.version,
                    payloadJsonSchema: contract.spec.payloadJsonSchema,
                    mutationsJsonSchema:
                      contract.mutations === null
                        ? null
                        : JSONSchema.make(contract.mutations),
                  }),
                ),
                signatureJsonSchema: JSONSchema.make(
                  binding.frontendController.signature,
                ),
              },
            })),
          }),
        ),
      }),
    ),
    serviceControllers: mapValues(
      system.serviceControllers,
      serviceController => ({
        name: serviceController.name,
        version: serviceController.version,
        models: mapValues(serviceController.models, model => ({
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
              properties: encodeShape({
                id: primitives.primaryKey({
                  abbreviation: definition.abbreviation,
                }),
                modelName: primitives.text({ nullable: false }),
                createdAt: primitives.date({ nullable: false }),
                updatedAt: primitives.date({ nullable: false }),
                version: primitives.text({ nullable: false }),
                ...definition.attributes,
              }),
              indexes: definition.indexes,
            })),
        })),
        contracts: mapValues(serviceController.contracts, contract => ({
          commandName: contract.commandName,
          version: contract.version,
          payloadJsonSchema: contract.spec.payloadJsonSchema,
          mutationsJsonSchema:
            contract.mutations === null
              ? null
              : JSONSchema.make(contract.mutations),
        })),
        mutationAdapters: mapValues(
          serviceController.mutationAdapters ?? {},
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

                const destinationJsonSchema = JSONSchema.make(
                  edge.destination,
                );
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
                const destinationModelName = Array.isArray(
                  destinationModelNames,
                )
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
        queries: mapValues(serviceController.queries, query => ({
          name: query.name,
          serviceName: query.serviceName,
          paramsJsonSchema: JSONSchema.make(query.paramsSchema),
        })),
      }),
    ),
  };
}
