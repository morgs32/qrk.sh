import { Effect } from 'effect';
import { isEqual } from 'es-toolkit';

import type { IOperationName } from '../contracts/types.ts';

import type { ISystemSpec } from './types.ts';

const semVerPattern =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

export const checkSystemCompatibility = Effect.fn('checkSystemCompatibility')(
  function* (props: { prior: ISystemSpec; next: ISystemSpec }) {
    const { next, prior } = props;
    yield* Effect.void;

    const diffs: {
      path: string;
      kind: string;
      requiredBump: 'none' | 'minor' | 'major';
      prior: unknown;
      next: unknown;
    }[] = [];
    const missingAdapters: {
      controllerKind: 'aggregate' | 'service';
      controllerName: string;
      modelName: string;
      modelVersion: string;
      operationName: IOperationName;
    }[] = [];
    let requiresNewGeneration = false;

    if (prior.systemName !== next.systemName) {
      diffs.push({
        path: 'systemName',
        kind: 'identity-changed',
        requiredBump: 'major',
        prior: prior.systemName,
        next: next.systemName,
      });
    }

    for (const aggregateName of new Set([
      ...Object.keys(prior.aggregates),
      ...Object.keys(next.aggregates),
    ])) {
      const priorAggregate = prior.aggregates[aggregateName];
      const nextAggregate = next.aggregates[aggregateName];
      const aggregatePath = `aggregates.${aggregateName}`;
      if (priorAggregate === undefined) {
        diffs.push({
          path: aggregatePath,
          kind: 'surface-added',
          requiredBump: 'minor',
          prior: undefined,
          next: nextAggregate,
        });
        requiresNewGeneration = true;
        continue;
      }
      if (nextAggregate === undefined) {
        diffs.push({
          path: aggregatePath,
          kind: 'surface-removed',
          requiredBump: 'major',
          prior: priorAggregate,
          next: undefined,
        });
        requiresNewGeneration = true;
        continue;
      }

      for (const modelName of new Set([
        ...Object.keys(priorAggregate.models),
        ...Object.keys(nextAggregate.models),
      ])) {
        const priorModel = priorAggregate.models[modelName];
        const nextModel = nextAggregate.models[modelName];
        const modelPath = `${aggregatePath}.models.${modelName}`;
        if (priorModel === undefined) {
          diffs.push({
            path: modelPath,
            kind: 'model-added',
            requiredBump: 'minor',
            prior: undefined,
            next: nextModel,
          });
          requiresNewGeneration = true;
          continue;
        }
        if (nextModel === undefined) {
          diffs.push({
            path: modelPath,
            kind: 'model-removed',
            requiredBump: 'major',
            prior: priorModel,
            next: undefined,
          });
          requiresNewGeneration = true;
          continue;
        }
        if (!isEqual(priorModel, nextModel)) {
          const historicalDefinition = nextModel.historicalDefinitions.find(
            definition => definition.version === priorModel.version,
          );
          const preservesPriorDefinition =
            historicalDefinition !== undefined &&
            historicalDefinition.modelName === priorModel.modelName &&
            historicalDefinition.abbreviation === priorModel.abbreviation &&
            isEqual(historicalDefinition.properties, priorModel.properties) &&
            isEqual(historicalDefinition.indexes, priorModel.indexes);
          diffs.push({
            path: modelPath,
            kind: preservesPriorDefinition
              ? 'model-version-advanced'
              : 'model-definition-incompatible',
            requiredBump: preservesPriorDefinition ? 'minor' : 'major',
            prior: priorModel,
            next: nextModel,
          });
          requiresNewGeneration = true;

          for (const operationName of [
            'create',
            'update',
            'delete',
            'move',
          ] satisfies readonly IOperationName[]) {
            const hasAdapter = nextAggregate.mutationAdapters[modelName]?.[
              operationName
            ]?.some(edge => edge.source.modelVersion === priorModel.version);
            if (hasAdapter !== true) {
              missingAdapters.push({
                controllerKind: 'aggregate',
                controllerName: aggregateName,
                modelName,
                modelVersion: priorModel.version,
                operationName,
              });
            }
          }
        }
      }

      for (const contractName of new Set([
        ...Object.keys(priorAggregate.contracts),
        ...Object.keys(nextAggregate.contracts),
      ])) {
        const priorContract = priorAggregate.contracts[contractName];
        const nextContract = nextAggregate.contracts[contractName];
        const contractPath = `${aggregatePath}.contracts.${contractName}`;
        if (priorContract === undefined) {
          diffs.push({
            path: contractPath,
            kind: 'contract-added',
            requiredBump: 'minor',
            prior: undefined,
            next: nextContract,
          });
          continue;
        }
        if (nextContract === undefined) {
          diffs.push({
            path: contractPath,
            kind: 'contract-removed',
            requiredBump: 'major',
            prior: priorContract,
            next: undefined,
          });
          continue;
        }
        if (!isEqual(priorContract, nextContract)) {
          const historicalDefinition = nextContract.historicalDefinitions.find(
            definition => definition.version === priorContract.version,
          );
          const preservesPriorDefinition =
            historicalDefinition !== undefined &&
            historicalDefinition.commandName === priorContract.commandName &&
            isEqual(
              historicalDefinition.payloadJsonSchema,
              priorContract.payloadJsonSchema,
            );
          diffs.push({
            path: contractPath,
            kind: preservesPriorDefinition
              ? 'contract-version-advanced'
              : 'contract-definition-incompatible',
            requiredBump: preservesPriorDefinition ? 'minor' : 'major',
            prior: priorContract,
            next: nextContract,
          });
        }
      }

      if (!isEqual(priorAggregate.selections, nextAggregate.selections)) {
        diffs.push({
          path: `${aggregatePath}.selections`,
          kind: 'projection-changed',
          requiredBump: 'minor',
          prior: priorAggregate.selections,
          next: nextAggregate.selections,
        });
        requiresNewGeneration = true;
      }
      if (!isEqual(priorAggregate.queries, nextAggregate.queries)) {
        diffs.push({
          path: `${aggregatePath}.queries`,
          kind: 'query-grants-changed',
          requiredBump: 'minor',
          prior: priorAggregate.queries,
          next: nextAggregate.queries,
        });
      }
      if (!isEqual(priorAggregate.frontends, nextAggregate.frontends)) {
        diffs.push({
          path: `${aggregatePath}.frontends`,
          kind: 'frontend-lock-support-changed',
          requiredBump: 'none',
          prior: priorAggregate.frontends,
          next: nextAggregate.frontends,
        });
      }
    }

    for (const serviceName of new Set([
      ...Object.keys(prior.services),
      ...Object.keys(next.services),
    ])) {
      const priorService = prior.services[serviceName];
      const nextService = next.services[serviceName];
      const servicePath = `services.${serviceName}`;
      if (priorService === undefined) {
        diffs.push({
          path: servicePath,
          kind: 'surface-added',
          requiredBump: 'minor',
          prior: undefined,
          next: nextService,
        });
        requiresNewGeneration = true;
        continue;
      }
      if (nextService === undefined) {
        diffs.push({
          path: servicePath,
          kind: 'surface-removed',
          requiredBump: 'major',
          prior: priorService,
          next: undefined,
        });
        requiresNewGeneration = true;
        continue;
      }

      for (const modelName of new Set([
        ...Object.keys(priorService.models),
        ...Object.keys(nextService.models),
      ])) {
        const priorModel = priorService.models[modelName];
        const nextModel = nextService.models[modelName];
        const modelPath = `${servicePath}.models.${modelName}`;
        if (priorModel === undefined || nextModel === undefined) {
          diffs.push({
            path: modelPath,
            kind: priorModel === undefined ? 'model-added' : 'model-removed',
            requiredBump: priorModel === undefined ? 'minor' : 'major',
            prior: priorModel,
            next: nextModel,
          });
          requiresNewGeneration = true;
          continue;
        }
        if (!isEqual(priorModel, nextModel)) {
          const historicalDefinition = nextModel.historicalDefinitions.find(
            definition => definition.version === priorModel.version,
          );
          const preservesPriorDefinition =
            historicalDefinition !== undefined &&
            historicalDefinition.modelName === priorModel.modelName &&
            historicalDefinition.abbreviation === priorModel.abbreviation &&
            isEqual(historicalDefinition.properties, priorModel.properties) &&
            isEqual(historicalDefinition.indexes, priorModel.indexes);
          diffs.push({
            path: modelPath,
            kind: preservesPriorDefinition
              ? 'model-version-advanced'
              : 'model-definition-incompatible',
            requiredBump: preservesPriorDefinition ? 'minor' : 'major',
            prior: priorModel,
            next: nextModel,
          });
          requiresNewGeneration = true;
          for (const operationName of [
            'create',
            'update',
            'delete',
            'move',
            'replicateResource',
          ] satisfies readonly IOperationName[]) {
            const hasAdapter = nextService.mutationAdapters[modelName]?.[
              operationName
            ]?.some(edge => edge.source.modelVersion === priorModel.version);
            if (hasAdapter !== true) {
              missingAdapters.push({
                controllerKind: 'service',
                controllerName: serviceName,
                modelName,
                modelVersion: priorModel.version,
                operationName,
              });
            }
          }
        }
      }

      for (const contractName of new Set([
        ...Object.keys(priorService.contracts),
        ...Object.keys(nextService.contracts),
      ])) {
        const priorContract = priorService.contracts[contractName];
        const nextContract = nextService.contracts[contractName];
        if (!isEqual(priorContract, nextContract)) {
          diffs.push({
            path: `${servicePath}.contracts.${contractName}`,
            kind:
              priorContract === undefined
                ? 'contract-added'
                : nextContract === undefined
                  ? 'contract-removed'
                  : 'contract-definition-changed',
            requiredBump: priorContract === undefined ? 'minor' : 'major',
            prior: priorContract,
            next: nextContract,
          });
        }
      }
      if (!isEqual(priorService.queries, nextService.queries)) {
        diffs.push({
          path: `${servicePath}.queries`,
          kind: 'query-surface-changed',
          requiredBump: 'minor',
          prior: priorService.queries,
          next: nextService.queries,
        });
      }
      if (!isEqual(priorService.frontends, nextService.frontends)) {
        diffs.push({
          path: `${servicePath}.frontends`,
          kind: 'frontend-lock-support-changed',
          requiredBump: 'none',
          prior: priorService.frontends,
          next: nextService.frontends,
        });
      }
    }

    const retainedAuthenticationSignatureVersions = new Set([
      next.authentication.signature.version,
      ...next.authentication.signature.historicalDefinitions.map(
        definition => definition.version,
      ),
    ]);
    if (
      ![
        prior.authentication.signature.version,
        ...prior.authentication.signature.historicalDefinitions.map(
          definition => definition.version,
        ),
      ].every(version => retainedAuthenticationSignatureVersions.has(version))
    ) {
      diffs.push({
        path: 'authentication.signature',
        kind: 'definition-history-removed',
        requiredBump: 'none',
        prior: prior.authentication.signature,
        next: next.authentication.signature,
      });
    }
    for (const priorSignatureDefinition of [
      prior.authentication.signature,
      ...prior.authentication.signature.historicalDefinitions,
    ]) {
      const nextSignatureDefinition = [
        next.authentication.signature,
        ...next.authentication.signature.historicalDefinitions,
      ].find(
        definition => definition.version === priorSignatureDefinition.version,
      );
      if (
        nextSignatureDefinition !== undefined &&
        !isEqual(
          priorSignatureDefinition.schemaJsonSchema,
          nextSignatureDefinition.schemaJsonSchema,
        )
      ) {
        diffs.push({
          path: `authentication.signature.${priorSignatureDefinition.version}`,
          kind: 'authentication-exact-definition-mutated',
          requiredBump: 'none',
          prior: priorSignatureDefinition,
          next: nextSignatureDefinition,
        });
      }
    }

    const frontendControllerPairs = [
      ...Object.entries(prior.aggregates).flatMap(
        ([aggregateName, aggregate]) =>
          Object.entries(aggregate.frontends).map(
            ([frontendName, frontend]) => ({
              path: `aggregates.${aggregateName}.frontends.${frontendName}.controller`,
              prior: frontend.controller,
              next: next.aggregates[aggregateName]?.frontends[frontendName]
                ?.controller,
            }),
          ),
      ),
      ...Object.entries(prior.services).flatMap(([serviceName, service]) =>
        Object.entries(service.frontends).map(([frontendName, frontend]) => ({
          path: `services.${serviceName}.frontends.${frontendName}.controller`,
          prior: frontend.controller,
          next: next.services[serviceName]?.frontends[frontendName]?.controller,
        })),
      ),
    ];
    for (const pair of frontendControllerPairs) {
      if (pair.next === undefined) continue;

      const retainedModelVersions = new Set(
        Object.entries(pair.next.models).flatMap(([modelName, model]) => [
          `${modelName}:${model.version}`,
          ...model.historicalDefinitions.map(
            definition => `${modelName}:${definition.version}`,
          ),
        ]),
      );
      const retainedContractVersions = new Set(
        Object.entries(pair.next.contracts).flatMap(
          ([contractName, contract]) => [
            `${contractName}:${contract.version}`,
            ...contract.historicalDefinitions.map(
              definition => `${contractName}:${definition.version}`,
            ),
          ],
        ),
      );
      const removedHistory =
        Object.entries(pair.prior.models).some(([modelName, model]) =>
          [
            model.version,
            ...model.historicalDefinitions.map(
              definition => definition.version,
            ),
          ].some(
            version => !retainedModelVersions.has(`${modelName}:${version}`),
          ),
        ) ||
        Object.entries(pair.prior.contracts).some(([contractName, contract]) =>
          [
            contract.version,
            ...contract.historicalDefinitions.map(
              definition => definition.version,
            ),
          ].some(
            version =>
              !retainedContractVersions.has(`${contractName}:${version}`),
          ),
        );
      for (const [modelName, priorModel] of Object.entries(pair.prior.models)) {
        const nextModel = pair.next.models[modelName];
        if (nextModel === undefined) continue;
        for (const priorModelDefinition of [
          priorModel,
          ...priorModel.historicalDefinitions,
        ]) {
          const nextModelDefinition = [
            nextModel,
            ...nextModel.historicalDefinitions,
          ].find(
            definition => definition.version === priorModelDefinition.version,
          );
          if (
            nextModelDefinition !== undefined &&
            (!isEqual(
              priorModelDefinition.properties,
              nextModelDefinition.properties,
            ) ||
              !isEqual(
                priorModelDefinition.indexes,
                nextModelDefinition.indexes,
              ) ||
              priorModelDefinition.modelName !==
                nextModelDefinition.modelName ||
              priorModelDefinition.abbreviation !==
                nextModelDefinition.abbreviation)
          ) {
            diffs.push({
              path: `${pair.path}.models.${modelName}.${priorModelDefinition.version}`,
              kind: 'frontend-exact-definition-mutated',
              requiredBump: 'none',
              prior: priorModelDefinition,
              next: nextModelDefinition,
            });
          }
        }
      }
      for (const [contractName, priorContract] of Object.entries(
        pair.prior.contracts,
      )) {
        const nextContract = pair.next.contracts[contractName];
        if (nextContract === undefined) continue;
        for (const priorContractDefinition of [
          priorContract,
          ...priorContract.historicalDefinitions,
        ]) {
          const nextContractDefinition = [
            nextContract,
            ...nextContract.historicalDefinitions,
          ].find(
            definition =>
              definition.version === priorContractDefinition.version,
          );
          if (
            nextContractDefinition !== undefined &&
            (priorContractDefinition.commandName !==
              nextContractDefinition.commandName ||
              !isEqual(
                priorContractDefinition.payloadJsonSchema,
                nextContractDefinition.payloadJsonSchema,
              ))
          ) {
            diffs.push({
              path: `${pair.path}.contracts.${contractName}.${priorContractDefinition.version}`,
              kind: 'frontend-exact-definition-mutated',
              requiredBump: 'none',
              prior: priorContractDefinition,
              next: nextContractDefinition,
            });
          }
        }
      }
      if (removedHistory) {
        diffs.push({
          path: pair.path,
          kind: 'frontend-exact-definition-removed',
          requiredBump: 'none',
          prior: pair.prior,
          next: pair.next,
        });
      }
    }

    if (missingAdapters.length > 0) {
      diffs.push({
        path: 'mutationAdapters',
        kind: 'required-adapters-missing',
        requiredBump: 'major',
        prior: null,
        next: missingAdapters,
      });
    }

    let requiredBump: 'none' | 'minor' | 'major' = 'none';
    for (const diff of diffs) {
      if (diff.requiredBump === 'major') {
        requiredBump = 'major';
        break;
      }
      if (diff.requiredBump === 'minor') {
        requiredBump = 'minor';
      }
    }

    const priorParts = prior.version.split(/[+-]/u)[0]?.split('.').map(Number);
    const nextParts = next.version.split(/[+-]/u)[0]?.split('.').map(Number);
    const validVersions =
      semVerPattern.test(prior.version) &&
      semVerPattern.test(next.version) &&
      priorParts?.length === 3 &&
      nextParts?.length === 3 &&
      priorParts.every(Number.isSafeInteger) &&
      nextParts.every(Number.isSafeInteger);
    const meetsFloor =
      requiredBump === 'none' ||
      (validVersions &&
        priorParts !== undefined &&
        nextParts !== undefined &&
        (requiredBump === 'major'
          ? nextParts[0] !== undefined &&
            priorParts[0] !== undefined &&
            nextParts[0] > priorParts[0]
          : nextParts[0] !== undefined &&
            priorParts[0] !== undefined &&
            nextParts[1] !== undefined &&
            priorParts[1] !== undefined &&
            (nextParts[0] > priorParts[0] ||
              (nextParts[0] === priorParts[0] &&
                nextParts[1] > priorParts[1]))));
    if (!validVersions) {
      diffs.push({
        path: 'version',
        kind: 'invalid-semver',
        requiredBump,
        prior: prior.version,
        next: next.version,
      });
    } else if (!meetsFloor) {
      diffs.push({
        path: 'version',
        kind: 'version-under-bumped',
        requiredBump,
        prior: prior.version,
        next: next.version,
      });
    } else if (prior.version !== next.version) {
      diffs.push({
        path: 'version',
        kind: 'authored-version-changed',
        requiredBump: 'none',
        prior: prior.version,
        next: next.version,
      });
    }

    return {
      requiredBump,
      diffs,
      missingAdapters,
      requiresNewGeneration,
    };
  },
);
