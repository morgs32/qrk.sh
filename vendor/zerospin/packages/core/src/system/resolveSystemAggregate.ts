import { Effect, Schema } from 'effect';
import { isEqual, mapValues } from 'es-toolkit';

import { makeAggregateCommand } from '../aggregate/makeAggregateCommand.ts';
import { Contract } from '../contracts/makeContract.ts';
import { identityContractAdapt } from '../contracts/makeContractAdapter.ts';
import type { IContract } from '../contracts/types.ts';
import { assertValidModels } from '../models/assertValidModels.ts';
import { Model } from '../models/makeModel.ts';
import type { IAggregateId, IModel, InferPayloadInput } from '../models/types.ts';
import { getByKeyOrThrow } from '../utils/getByKeyOrThrow.ts';

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

const CanonicalContractSchema = Schema.declare(
  (input: unknown): input is IContract => input instanceof Contract,
);

const ContractAdapterEntrySchema = Schema.Struct({
  contract: CanonicalContractSchema,
  adapt: FunctionSchema,
});

const SupportedAggregateOperations = [
  'create',
  'update',
  'delete',
  'move',
] as const;

export function resolveSystemAggregate(props: {
  name: string;
  aggregateName: string;
  aggregate: ReturnType<typeof decodeSystemProps>['aggregates'][string];
  services: Record<
    string,
    {
      models: Record<string, IModel>;
      queries: Record<string, unknown>;
    }
  >;
  serviceNameBySourceModel: Map<IModel, string>;
}) {
  const {
    name,
    aggregateName,
    aggregate,
    services,
    serviceNameBySourceModel,
  } = props;
  const {
    models,
    contracts,
    mutationAdapters,
    selections,
    queries: queryGrants = {},
    frontends: frontendInputs,
    authorize,
  } = aggregate;

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
          return `authorize must be a function when the aggregate has frontends`;
        }
        return true;
      }),
    ),
    { onExcessProperty: 'error' },
  )({ authorize });

  assertValidModels({
    models,
    context: `makeSystem: aggregates.${aggregateName}`,
  });

  Schema.decodeUnknownSync(
    Schema.Record(Schema.String, CanonicalModelSchema).check(
      Schema.makeFilter((decodedModels: Record<string, IModel>) => {
        for (const [modelKey, model] of Object.entries(decodedModels)) {
          if (Model.isReplica(model)) {
            const sourceModel = Reflect.get(model, 'sourceModel');
            const sourceServiceName = Reflect.get(model, 'serviceName');
            const sourceService =
              typeof sourceServiceName === 'string'
                ? services[sourceServiceName]
                : undefined;
            if (
              sourceService === undefined ||
              !(sourceModel instanceof Model) ||
              sourceService.models[model.modelName] !== sourceModel
            ) {
              return {
                path: [modelKey],
                issue: `must replicate the exact source model "${String(sourceServiceName)}.${model.modelName}"`,
              };
            }
            continue;
          }
          const sourceServiceName = serviceNameBySourceModel.get(model);
          if (sourceServiceName !== undefined) {
            return {
              path: [modelKey],
              issue: `must use makeReplica for source model "${sourceServiceName}.${model.modelName}"`,
            };
          }
        }
        return true;
      }),
    ),
    { onExcessProperty: 'error' },
  )(models);

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
            if (operationName === 'replicateResource') {
              return {
                path: [sourceModelName, operationName],
                issue: `belongs to the source service`,
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
                if (Model.isReplica(sourceModel)) {
                  return {
                    path: [sourceModelName],
                    issue: `belongs to its service`,
                  };
                }
                if (sourceIdentity.modelVersion === sourceModel.version) {
                  return {
                    path: [sourceModelName, operationName, edgeIndex],
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
                  issue: `destination model "${destinationIdentity.modelName}" is not an aggregate model`,
                };
              }
              if (
                destinationIdentity.modelVersion !== destinationModel.version
              ) {
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
            for (const requiredOperationName of SupportedAggregateOperations) {
              const operationVersions = retiredVersionsByOperation.get(
                requiredOperationName,
              );
              if (
                createVersions === undefined ||
                createVersions.size === 0 ||
                operationVersions === undefined ||
                operationVersions.size !== createVersions.size
              ) {
                return `retired model "${sourceModelName}" must exhaustively adapt or discard every create/update/delete/move source version`;
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

  Schema.decodeUnknownSync(
    Schema.Record(
      Schema.String,
      Schema.Struct({
        model: CanonicalModelSchema,
        where: FunctionSchema,
      }),
    ).check(
      Schema.makeFilter(
        (decodedSelections: Record<string, { model: IModel }>) => {
          if (
            Object.keys(decodedSelections).length !== Object.keys(models).length
          ) {
            return `must contain exactly one selection for every model`;
          }
          for (const [modelKey, selection] of Object.entries(decodedSelections)) {
            if (selection.model !== models[modelKey]) {
              return {
                path: [modelKey, 'model'],
                issue: `must be the same object as models.${modelKey}`,
              };
            }
          }
          return true;
        },
      ),
    ),
    { onExcessProperty: 'error' },
  )(selections);

  const queries = mapValues(queryGrants, (grant, queryKey) => {
    const queryName = String(queryKey);
    Schema.decodeUnknownSync(
      Schema.Struct({
        service: Schema.String,
        query: Schema.Literal(queryName),
      }).check(
        Schema.makeFilter(decodedGrant => {
          const sourceService = services[decodedGrant.service];
          if (sourceService === undefined) {
            return `references missing service "${decodedGrant.service}"`;
          }
          if (sourceService.queries[decodedGrant.query] === undefined) {
            return `references missing service query "${decodedGrant.service}.${decodedGrant.query}"`;
          }
          return true;
        }),
      ),
      { onExcessProperty: 'error' },
    )(grant);
    const sourceService = services[grant.service];
    if (sourceService === undefined) {
      return grant;
    }
    return sourceService.queries[grant.query];
  });

  const frontends = mapValues(frontendInputs, (binding, frontendKey) => {
    const frontendName = String(frontendKey);
    const {
      controller,
      models: authoredModelBindings,
      projectionAdapters = {},
      contractAdapters = {},
    } = binding;

    Schema.decodeUnknownSync(
      Schema.Struct({
        kind: Schema.Literal('aggregate'),
        systemName: Schema.Literal(name),
        aggregateName: Schema.Literal(aggregateName),
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
                issue: `references missing aggregate model "${sourceModelKey}"`,
              };
            }
            if (usedSourceModelKeys.has(sourceModelKey)) {
              return `must not bind aggregate model "${sourceModelKey}" more than once`;
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
                issue: `must exactly match aggregate model "${sourceModel.modelName}" when no projection adapter is allowed`,
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

    Schema.decodeUnknownSync(
      Schema.Record(
        Schema.String,
        Schema.Array(
          Schema.Struct({
            models: Schema.Record(Schema.String, CanonicalModelSchema),
            program: FunctionSchema,
          }),
        ),
      ).check(
        Schema.makeFilter(decodedGuards => {
          for (const [commandName, guards] of Object.entries(decodedGuards)) {
            for (const [guardIndex, guard] of guards.entries()) {
              for (const [guardModelKey, guardModel] of Object.entries(
                guard.models,
              )) {
                if (controller.models[guardModelKey] !== guardModel) {
                  return {
                    path: [commandName, guardIndex, 'models', guardModelKey],
                    issue: `must be the same object as controller.models.${guardModelKey}`,
                  };
                }
                if (bindingModels[guardModelKey] !== guardModel) {
                  return {
                    path: [commandName, guardIndex, 'models', guardModelKey],
                    issue: `must be identity-bound to authoritative aggregate model "${guardModel.modelName}"`,
                  };
                }
              }
            }
          }
          return true;
        }),
      ),
      { onExcessProperty: 'ignore' },
    )(controller.guards);

    const resolvedContracts: Record<string, IContract> = {};
    const resolvedContractAdapters: Record<string, unknown> = {};
    for (const [contractKey, frontendContract] of Object.entries(
      controller.contracts,
    )) {
      const override = contractAdapters[contractKey];
      if (override === undefined) {
        resolvedContracts[contractKey] = frontendContract;
        resolvedContractAdapters[contractKey] = identityContractAdapt;
      } else {
        resolvedContracts[contractKey] = override.contract;
        resolvedContractAdapters[contractKey] = override.adapt;
      }

      Schema.decodeUnknownSync(
        Schema.declare(
          (input: unknown): input is IContract =>
            input === resolvedContracts[contractKey],
        ).check(
          Schema.makeFilter(
            () =>
              contracts[contractKey] === resolvedContracts[contractKey] ||
              `must be the same authoritative contract resolved by frontends.${frontendName}`,
          ),
        ),
        { onExcessProperty: 'error' },
      )(contracts[contractKey]);
    }

    Schema.decodeUnknownSync(
      Schema.Record(Schema.String, ContractAdapterEntrySchema).check(
        Schema.makeFilter((decodedAdapters: Record<string, unknown>) => {
          for (const adapterKey of Object.keys(decodedAdapters)) {
            if (controller.contracts[adapterKey] === undefined) {
              return {
                path: [adapterKey],
                issue: `is not a frontend contract`,
              };
            }
          }
          return true;
        }),
      ),
      { onExcessProperty: 'error' },
    )(contractAdapters);

    return {
      name: frontendName,
      controller,
      models: bindingModels,
      contracts: resolvedContracts,
      projectionAdapters,
      contractAdapters: resolvedContractAdapters,
    };
  });

  const makeCommand = <CONTRACT_NAME extends keyof typeof contracts & string>(commandProps: {
    contractName: CONTRACT_NAME;
    aggregateId: IAggregateId;
    systemName: string;
    payload: InferPayloadInput<(typeof contracts)[CONTRACT_NAME]['payload']>;
  }) => {
    return Effect.gen(function* () {
      const { contractName, ...aggregateCommandProps } = commandProps;
      const contract = yield* getByKeyOrThrow({
        record: contracts,
        key: contractName,
        recordKind: `makeSystem: aggregates.${aggregateName}.contracts`,
      });
      return yield* makeAggregateCommand({
        contract,
        aggregateName,
        ...aggregateCommandProps,
      });
    });
  };

  const resolvedAggregate = {
    name: aggregateName,
    models,
    contracts,
    mutationAdapters,
    selections,
    queries,
    frontends,
    makeCommand,
  };
  return hasFrontends
    ? { ...resolvedAggregate, authorize }
    : resolvedAggregate;
}