import { Schema } from 'effect';
import { isEqual, mapValues } from 'es-toolkit';

import { assertValidModels } from '../models/assertValidModels.ts';
import { Model } from '../models/makeModel.ts';
import type { IModel, InferPayloadInput } from '../models/types.ts';
import { makeServiceCommand } from '../service/makeServiceCommand.ts';

import type { decodeSystemProps } from './decodeSystemProps.ts';
import { decodeMutationSchemaIdentity } from './decodeMutationSchemaIdentity.ts';

const FunctionSchema = Schema.declare(
  (input: unknown): input is (...args: never[]) => unknown =>
    typeof input === 'function',
);

const EffectSchemaSchema = Schema.declare(
  (input: unknown): input is Schema.Codec<unknown, unknown> =>
    Schema.isSchema(input),
);

const CanonicalModelSchema = Schema.declare(
  (input: unknown): input is IModel => input instanceof Model,
);

const SupportedServiceOperations = [
  'create',
  'update',
  'delete',
  'move',
  'replicateResource',
] as const;

export function resolveSystemService(props: {
  name: string;
  serviceName: string;
  service: ReturnType<typeof decodeSystemProps>['services'][string];
  serviceNameBySourceModel: Map<IModel, string>;
}) {
  const { name, serviceName, service, serviceNameBySourceModel } = props;
  const {
    models,
    contracts,
    mutationAdapters,
    queries: queryInputs = {},
    frontends: frontendInputs = {},
    authorize,
  } = service;

  const hasFrontends = Object.keys(frontendInputs).length > 0;
  Schema.decodeUnknownSync(
    Schema.Struct({
      authorize: Schema.Union([FunctionSchema, Schema.Undefined]),
    }).check(
      Schema.makeFilter(decoded => {
        if (!hasFrontends && decoded.authorize !== undefined) {
          return `must omit authorize when it has no frontends`;
        }
        if (hasFrontends && typeof decoded.authorize !== 'function') {
          return `authorize must be a function when the service has frontends`;
        }
        return true;
      }),
    ),
    { onExcessProperty: 'error' },
  )({ authorize });

  assertValidModels({
    models,
    context: `makeSystem: services.${serviceName}`,
  });

  Schema.decodeUnknownSync(
    Schema.Record(Schema.String, CanonicalModelSchema).check(
      Schema.makeFilter((decodedModels: Record<string, IModel>) => {
        for (const [modelKey, model] of Object.entries(decodedModels)) {
          if (Model.isReplica(model)) {
            return {
              path: [modelKey],
              issue: `must be the authoritative source model, not a replica`,
            };
          }
          const priorServiceName = serviceNameBySourceModel.get(model);
          if (priorServiceName !== undefined) {
            return {
              path: [modelKey],
              issue: `reuses a source model already owned by service "${priorServiceName}"`,
            };
          }
        }
        return true;
      }),
    ),
    { onExcessProperty: 'error' },
  )(models);

  for (const model of Object.values(models)) {
    serviceNameBySourceModel.set(model, serviceName);
  }

  Schema.decodeUnknownSync(
    Schema.Record(
      Schema.String,
      Schema.Record(
        Schema.String,
        Schema.Array(
          Schema.Union([
            Schema.Struct({
              source: EffectSchemaSchema,
              destination: Schema.Null,
            }),
            Schema.Struct({
              source: EffectSchemaSchema,
              destination: EffectSchemaSchema,
              adapter: FunctionSchema,
            }),
          ]),
        ),
      ),
    ).check(
      Schema.makeFilter(adapters => {
        for (const [sourceModelName, operationAdapters] of Object.entries(
          adapters,
        )) {
          const retiredVersionsByOperation = new Map<string, Set<string>>();
          for (const [operationName, edges] of Object.entries(
            operationAdapters,
          )) {
            if (
              operationName !== 'create' &&
              operationName !== 'update' &&
              operationName !== 'delete' &&
              operationName !== 'move' &&
              operationName !== 'replicateResource'
            ) {
              return {
                path: [sourceModelName, operationName],
                issue: `is not a supported mutation operation`,
              };
            }
            const sourceVersions = new Set<string>();
            retiredVersionsByOperation.set(operationName, sourceVersions);
            for (const [edgeIndex, edge] of edges.entries()) {
              let sourceIdentity: {
                modelName: string;
                modelVersion: string;
                operationName: string;
              };
              try {
                sourceIdentity = decodeMutationSchemaIdentity(edge.source);
              } catch {
                return {
                  path: [sourceModelName, operationName, edgeIndex, 'source'],
                  issue: `has no mutation identity`,
                };
              }
              if (sourceIdentity.modelName !== sourceModelName) {
                return {
                  path: [sourceModelName, operationName, edgeIndex],
                  issue: `source modelName is "${sourceIdentity.modelName}"`,
                };
              }
              if (sourceIdentity.operationName !== operationName) {
                return {
                  path: [sourceModelName, operationName, edgeIndex],
                  issue: `source operationName is "${sourceIdentity.operationName}"`,
                };
              }
              if (sourceVersions.has(sourceIdentity.modelVersion)) {
                return {
                  path: [sourceModelName, operationName],
                  issue: `repeats source version "${sourceIdentity.modelVersion}"`,
                };
              }
              sourceVersions.add(sourceIdentity.modelVersion);
              const sourceModel = models[sourceModelName];
              if (sourceModel !== undefined) {
                if (sourceIdentity.modelVersion === sourceModel.version) {
                  return {
                    path: [
                      sourceModelName,
                      operationName,
                      edgeIndex,
                    ],
                    issue: `source version "${sourceIdentity.modelVersion}" is current; adapter sources must be historical`,
                  };
                }
                if (
                  !sourceModel.historicalDefinitions.some(
                    definition =>
                      definition.version === sourceIdentity.modelVersion,
                  )
                ) {
                  return {
                    path: [sourceModelName, operationName, edgeIndex],
                    issue: `source version "${sourceIdentity.modelVersion}" is not declared by model "${sourceModelName}"`,
                  };
                }
              }
              if (edge.destination === null) {
                continue;
              }
              let destinationIdentity: {
                modelName: string;
                modelVersion: string;
                operationName: string;
              };
              try {
                destinationIdentity = decodeMutationSchemaIdentity(
                  edge.destination,
                );
              } catch {
                return {
                  path: [
                    sourceModelName,
                    operationName,
                    edgeIndex,
                    'destination',
                  ],
                  issue: `has no mutation identity`,
                };
              }
              const destinationModel = models[destinationIdentity.modelName];
              if (destinationModel === undefined) {
                return {
                  path: [sourceModelName, operationName, edgeIndex],
                  issue: `destination model "${destinationIdentity.modelName}" is not owned by service "${serviceName}"`,
                };
              }
              if (destinationIdentity.modelVersion !== destinationModel.version) {
                return {
                  path: [sourceModelName, operationName, edgeIndex],
                  issue: `destination version "${destinationIdentity.modelVersion}" is not current version "${destinationModel.version}"`,
                };
              }
              if (destinationIdentity.operationName !== operationName) {
                return {
                  path: [sourceModelName, operationName, edgeIndex],
                  issue: `destination operationName is "${destinationIdentity.operationName}"`,
                };
              }
            }
          }
          if (models[sourceModelName] === undefined) {
            const createVersions = retiredVersionsByOperation.get('create');
            for (const requiredOperationName of SupportedServiceOperations) {
              const operationVersions = retiredVersionsByOperation.get(
                requiredOperationName,
              );
              if (
                createVersions === undefined ||
                createVersions.size === 0 ||
                operationVersions === undefined ||
                operationVersions.size !== createVersions.size
              ) {
                return `retired model "${sourceModelName}" must exhaustively adapt or discard every create/update/delete/move/replicateResource source version`;
              }
              for (const sourceVersion of createVersions) {
                if (!operationVersions.has(sourceVersion)) {
                  return `retired model "${sourceModelName}" is missing ${requiredOperationName} adapter for source version "${sourceVersion}"`;
                }
              }
            }
          }
        }
        return true;
      }),
    ),
    { onExcessProperty: 'error' },
  )(mutationAdapters ?? {});

  const queries = mapValues(queryInputs, (query, queryKey) => ({
    ...query,
    kind: 'service' as const,
    name: String(queryKey),
    serviceName,
  }));

  const frontends = mapValues(frontendInputs, (binding, frontendKey) => {
    const frontendName = String(frontendKey);
    const {
      controller,
      models: authoredModelBindings,
      projectionAdapters = {},
    } = binding;

    Schema.decodeUnknownSync(
      Schema.Struct({
        kind: Schema.Literal('service'),
        systemName: Schema.Literal(name),
        serviceName: Schema.Literal(serviceName),
        frontendName: Schema.Literal(frontendName),
      }),
      { onExcessProperty: 'ignore' },
    )(controller);

    const resolvedModelBindings: Record<string, string> = {};
    if (authoredModelBindings === undefined) {
      for (const modelKey of Object.keys(controller.models)) {
        if (models[modelKey] !== undefined) {
          resolvedModelBindings[modelKey] = modelKey;
        }
      }
    } else {
      Object.assign(resolvedModelBindings, authoredModelBindings);
    }

    const bindingModels: Record<string, IModel> = {};
    const usedSourceModelKeys = new Set<string>();
    Schema.decodeUnknownSync(
      Schema.Record(Schema.String, Schema.String).check(
        Schema.makeFilter((decodedBindings: Record<string, string>) => {
          for (const [frontendModelKey, sourceModelKey] of Object.entries(
            decodedBindings,
          )) {
            if (controller.models[frontendModelKey] === undefined) {
              return {
                path: [frontendModelKey],
                issue: `is not a frontend model`,
              };
            }
            if (models[sourceModelKey] === undefined) {
              return {
                path: [frontendModelKey],
                issue: `references missing service model "${sourceModelKey}"`,
              };
            }
            if (usedSourceModelKeys.has(sourceModelKey)) {
              return `must not bind service model "${sourceModelKey}" more than once`;
            }
            usedSourceModelKeys.add(sourceModelKey);
          }
          return true;
        }),
      ),
      { onExcessProperty: 'error' },
    )(resolvedModelBindings);

    for (const [frontendModelKey, sourceModelKey] of Object.entries(
      resolvedModelBindings,
    )) {
      const sourceModel = models[sourceModelKey];
      if (sourceModel !== undefined) {
        bindingModels[frontendModelKey] = sourceModel;
      }
    }

    Schema.decodeUnknownSync(
      Schema.Record(Schema.String, CanonicalModelSchema).check(
        Schema.makeFilter((decodedBindingModels: Record<string, IModel>) => {
          for (const [frontendModelKey, sourceModel] of Object.entries(
            decodedBindingModels,
          )) {
            const frontendModel = controller.models[frontendModelKey];
            if (frontendModel === undefined) {
              continue;
            }
            const diverges = sourceModel.modelName !== frontendModel.modelName;
            const hasAdapter = frontendModelKey in projectionAdapters;
            if (!diverges && !isEqual(sourceModel.spec, frontendModel.spec)) {
              return {
                path: [frontendModelKey],
                issue: `must exactly match service model "${sourceModel.modelName}" when no projection adapter is allowed`,
              };
            }
            if (diverges && !hasAdapter) {
              return `projectionAdapters.${frontendModelKey} is required when source modelName "${sourceModel.modelName}" differs from frontend modelName "${frontendModel.modelName}"`;
            }
            if (!diverges && hasAdapter) {
              return `projectionAdapters.${frontendModelKey} must not be set when source and frontend modelName both equal "${frontendModel.modelName}"`;
            }
          }
          for (const adapterKey of Object.keys(projectionAdapters)) {
            if (decodedBindingModels[adapterKey] === undefined) {
              return `projectionAdapters.${adapterKey} has no matching binding model`;
            }
          }
          return true;
        }),
      ),
      { onExcessProperty: 'error' },
    )(bindingModels);

    return {
      name: frontendName,
      controller,
      models: bindingModels,
      projectionAdapters,
    };
  });

  const makeCommand = <CONTRACT_NAME extends keyof typeof contracts & string>(commandProps: {
    contractName: CONTRACT_NAME;
    payload: InferPayloadInput<(typeof contracts)[CONTRACT_NAME]['payload']>;
  }) =>
    makeServiceCommand({
      contracts,
      serviceName,
      ...commandProps,
    });

  const resolvedService = {
    name: serviceName,
    models,
    contracts,
    mutationAdapters,
    queries,
    frontends,
    makeCommand,
  };
  return hasFrontends ? { ...resolvedService, authorize } : resolvedService;
}
