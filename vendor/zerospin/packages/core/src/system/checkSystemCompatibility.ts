import { Effect } from 'effect';
import { isEqual } from 'es-toolkit';

import type { IOperationName } from '../contracts/types.ts';

import type { ISystemSpec } from './types.ts';

const semVerPattern =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

/**
 * Compares two complete SystemSpecs without executing authored programs.
 *
 * Compatibility traversal checkpoints:
 * 1. Enumerate every repeated controller/model/contract/query/signature surface.
 * 2. Compare model properties and indexes directionally and record the exact
 *    path of each structural addition, removal, or change.
 * 3. Compare payload/query/signature JSON Schemas directionally.
 * 4. Compare contract mutation-slot membership and inherit model severity when
 *    only a slot's model version advances.
 * 5. Report each incompatible persisted mutation variant that lacks one direct
 *    controller-owned adapter edge.
 * 6. Propagate structural severity through model, contract, controller, and
 *    system SemVers while leaving patch-only logic changes authored.
 */
export const checkSystemCompatibility = Effect.fn(
  'checkSystemCompatibility',
)(function* (props: {
  prior: ISystemSpec;
  next: ISystemSpec;
}) {
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
    controllerKind: 'account' | 'service';
    controllerName: string;
    modelName: string;
    modelVersion: string;
    operationName: IOperationName;
  }[] = [];
  const modelComparisons: {
    path: string;
    bumpKey: string;
    prior:
      | ISystemSpec['accountControllers'][string]['models'][string]
      | undefined;
    next:
      | ISystemSpec['accountControllers'][string]['models'][string]
      | undefined;
    adapterOwner:
      | {
          controllerKind: 'account' | 'service';
          controllerName: string;
          mutationAdapters:
            | ISystemSpec['accountControllers'][string]['mutationAdapters']
            | undefined;
          operations: readonly IOperationName[];
        }
      | null;
  }[] = [];
  const contractComparisons: {
    path: string;
    modelBumpPrefix: string;
    prior:
      | ISystemSpec['accountControllers'][string]['contracts'][string]
      | undefined;
    next:
      | ISystemSpec['accountControllers'][string]['contracts'][string]
      | undefined;
  }[] = [];
  const schemaComparisons: {
    path: string;
    prior: unknown;
    next: unknown;
  }[] = [];
  const componentVersions: {
    path: string;
    priorVersion: string;
    nextVersion: string;
  }[] = [];
  const modelBumps: Record<string, 'none' | 'minor' | 'major'> = {};
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

  // 1 — Service controllers are both runtime surfaces and mutation-adapter
  // owners. Their models/contracts/queries are queued for the exact comparators
  // below so the same rules are used for every repeated definition.
  const serviceNames = new Set([
    ...Object.keys(prior.serviceControllers),
    ...Object.keys(next.serviceControllers),
  ]);
  for (const serviceName of serviceNames) {
    const priorService = prior.serviceControllers[serviceName];
    const nextService = next.serviceControllers[serviceName];
    const servicePath = `serviceControllers.${serviceName}`;

    if (priorService === undefined && nextService !== undefined) {
      diffs.push({
        path: servicePath,
        kind: 'surface-added',
        requiredBump: 'minor',
        prior: undefined,
        next: nextService,
      });
    } else if (priorService !== undefined && nextService === undefined) {
      diffs.push({
        path: servicePath,
        kind: 'surface-removed',
        requiredBump: 'major',
        prior: priorService,
        next: undefined,
      });
    } else if (priorService !== undefined && nextService !== undefined) {
      componentVersions.push({
        path: servicePath,
        priorVersion: priorService.version,
        nextVersion: nextService.version,
      });
      if (priorService.name !== nextService.name) {
        diffs.push({
          path: `${servicePath}.name`,
          kind: 'identity-changed',
          requiredBump: 'major',
          prior: priorService.name,
          next: nextService.name,
        });
      }
      if (priorService.version !== nextService.version) {
        diffs.push({
          path: `${servicePath}.version`,
          kind: 'authored-version-changed',
          requiredBump: 'none',
          prior: priorService.version,
          next: nextService.version,
        });
      }
      if (!isEqual(priorService.mutationAdapters, nextService.mutationAdapters)) {
        let removedAdapter = false;
        for (const [sourceModelName, priorOperations] of Object.entries(
          priorService.mutationAdapters,
        )) {
          for (const [operationName, priorEdges] of Object.entries(
            priorOperations,
          )) {
            const nextEdges =
              nextService.mutationAdapters[sourceModelName]?.[
                operationName === 'create' ||
                operationName === 'delete' ||
                operationName === 'move' ||
                operationName === 'replicateResource' ||
                operationName === 'update'
                  ? operationName
                  : 'create'
              ];
            if (
              priorEdges !== undefined &&
              priorEdges.some(
                priorEdge =>
                  nextEdges?.some(nextEdge =>
                    isEqual(nextEdge.source, priorEdge.source),
                  ) !== true,
              )
            ) {
              removedAdapter = true;
            }
          }
        }
        diffs.push({
          path: `${servicePath}.mutationAdapters`,
          kind: removedAdapter ? 'adapter-removed' : 'adapter-added',
          requiredBump: removedAdapter ? 'major' : 'minor',
          prior: priorService.mutationAdapters,
          next: nextService.mutationAdapters,
        });
      }
    }

    const priorModels = priorService?.models ?? {};
    const nextModels = nextService?.models ?? {};
    for (const modelKey of new Set([
      ...Object.keys(priorModels),
      ...Object.keys(nextModels),
    ])) {
      modelComparisons.push({
        path: `${servicePath}.models.${modelKey}`,
        bumpKey: `service:${serviceName}:${priorModels[modelKey]?.modelName ?? nextModels[modelKey]?.modelName ?? modelKey}`,
        prior: priorModels[modelKey],
        next: nextModels[modelKey],
        adapterOwner: {
          controllerKind: 'service',
          controllerName: serviceName,
          mutationAdapters: nextService?.mutationAdapters,
          operations: [
            'create',
            'delete',
            'move',
            'replicateResource',
            'update',
          ],
        },
      });
    }

    const priorContracts = priorService?.contracts ?? {};
    const nextContracts = nextService?.contracts ?? {};
    for (const contractKey of new Set([
      ...Object.keys(priorContracts),
      ...Object.keys(nextContracts),
    ])) {
      contractComparisons.push({
        path: `${servicePath}.contracts.${contractKey}`,
        modelBumpPrefix: `service:${serviceName}:`,
        prior: priorContracts[contractKey],
        next: nextContracts[contractKey],
      });
    }

    const priorQueries = priorService?.queries ?? {};
    const nextQueries = nextService?.queries ?? {};
    for (const queryKey of new Set([
      ...Object.keys(priorQueries),
      ...Object.keys(nextQueries),
    ])) {
      const priorQuery = priorQueries[queryKey];
      const nextQuery = nextQueries[queryKey];
      const queryPath = `${servicePath}.queries.${queryKey}`;
      if (priorQuery === undefined && nextQuery !== undefined) {
        diffs.push({
          path: queryPath,
          kind: 'surface-added',
          requiredBump: 'minor',
          prior: undefined,
          next: nextQuery,
        });
      } else if (priorQuery !== undefined && nextQuery === undefined) {
        diffs.push({
          path: queryPath,
          kind: 'surface-removed',
          requiredBump: 'major',
          prior: priorQuery,
          next: undefined,
        });
      } else if (priorQuery !== undefined && nextQuery !== undefined) {
        if (
          priorQuery.name !== nextQuery.name ||
          priorQuery.serviceName !== nextQuery.serviceName
        ) {
          diffs.push({
            path: queryPath,
            kind: 'identity-changed',
            requiredBump: 'major',
            prior: {
              name: priorQuery.name,
              serviceName: priorQuery.serviceName,
            },
            next: {
              name: nextQuery.name,
              serviceName: nextQuery.serviceName,
            },
          });
        }
        schemaComparisons.push({
          path: `${queryPath}.paramsJsonSchema`,
          prior: priorQuery.paramsJsonSchema,
          next: nextQuery.paramsJsonSchema,
        });
      }
    }
  }

  // 1 continued — Account controllers own account mutation adapters and repeat
  // their actor/frontend graph. Every nested model and contract is intentionally
  // queued again rather than normalized into references.
  const accountNames = new Set([
    ...Object.keys(prior.accountControllers),
    ...Object.keys(next.accountControllers),
  ]);
  for (const accountName of accountNames) {
    const priorAccount = prior.accountControllers[accountName];
    const nextAccount = next.accountControllers[accountName];
    const accountPath = `accountControllers.${accountName}`;

    if (priorAccount === undefined && nextAccount !== undefined) {
      diffs.push({
        path: accountPath,
        kind: 'surface-added',
        requiredBump: 'minor',
        prior: undefined,
        next: nextAccount,
      });
    } else if (priorAccount !== undefined && nextAccount === undefined) {
      diffs.push({
        path: accountPath,
        kind: 'surface-removed',
        requiredBump: 'major',
        prior: priorAccount,
        next: undefined,
      });
    } else if (priorAccount !== undefined && nextAccount !== undefined) {
      componentVersions.push({
        path: accountPath,
        priorVersion: priorAccount.version,
        nextVersion: nextAccount.version,
      });
      if (priorAccount.name !== nextAccount.name) {
        diffs.push({
          path: `${accountPath}.name`,
          kind: 'identity-changed',
          requiredBump: 'major',
          prior: priorAccount.name,
          next: nextAccount.name,
        });
      }
      if (priorAccount.version !== nextAccount.version) {
        diffs.push({
          path: `${accountPath}.version`,
          kind: 'authored-version-changed',
          requiredBump: 'none',
          prior: priorAccount.version,
          next: nextAccount.version,
        });
      }
      if (!isEqual(priorAccount.mutationAdapters, nextAccount.mutationAdapters)) {
        let removedAdapter = false;
        for (const [sourceModelName, priorOperations] of Object.entries(
          priorAccount.mutationAdapters,
        )) {
          for (const [operationName, priorEdges] of Object.entries(
            priorOperations,
          )) {
            const nextEdges =
              nextAccount.mutationAdapters[sourceModelName]?.[
                operationName === 'create' ||
                operationName === 'delete' ||
                operationName === 'move' ||
                operationName === 'replicateResource' ||
                operationName === 'update'
                  ? operationName
                  : 'create'
              ];
            if (
              priorEdges !== undefined &&
              priorEdges.some(
                priorEdge =>
                  nextEdges?.some(nextEdge =>
                    isEqual(nextEdge.source, priorEdge.source),
                  ) !== true,
              )
            ) {
              removedAdapter = true;
            }
          }
        }
        diffs.push({
          path: `${accountPath}.mutationAdapters`,
          kind: removedAdapter ? 'adapter-removed' : 'adapter-added',
          requiredBump: removedAdapter ? 'major' : 'minor',
          prior: priorAccount.mutationAdapters,
          next: nextAccount.mutationAdapters,
        });
      }
    }

    const priorModels = priorAccount?.models ?? {};
    const nextModels = nextAccount?.models ?? {};
    for (const modelKey of new Set([
      ...Object.keys(priorModels),
      ...Object.keys(nextModels),
    ])) {
      modelComparisons.push({
        path: `${accountPath}.models.${modelKey}`,
        bumpKey: `account:${accountName}:${priorModels[modelKey]?.modelName ?? nextModels[modelKey]?.modelName ?? modelKey}`,
        prior: priorModels[modelKey],
        next: nextModels[modelKey],
        adapterOwner: {
          controllerKind: 'account',
          controllerName: accountName,
          mutationAdapters: nextAccount?.mutationAdapters,
          operations: ['create', 'delete', 'move', 'update'],
        },
      });
    }

    const priorContracts = priorAccount?.contracts ?? {};
    const nextContracts = nextAccount?.contracts ?? {};
    for (const contractKey of new Set([
      ...Object.keys(priorContracts),
      ...Object.keys(nextContracts),
    ])) {
      contractComparisons.push({
        path: `${accountPath}.contracts.${contractKey}`,
        modelBumpPrefix: `account:${accountName}:`,
        prior: priorContracts[contractKey],
        next: nextContracts[contractKey],
      });
    }

    const priorActors = priorAccount?.actorControllers ?? {};
    const nextActors = nextAccount?.actorControllers ?? {};
    for (const actorName of new Set([
      ...Object.keys(priorActors),
      ...Object.keys(nextActors),
    ])) {
      const priorActor = priorActors[actorName];
      const nextActor = nextActors[actorName];
      const actorPath = `${accountPath}.actorControllers.${actorName}`;
      if (priorActor === undefined && nextActor !== undefined) {
        diffs.push({
          path: actorPath,
          kind: 'surface-added',
          requiredBump: 'minor',
          prior: undefined,
          next: nextActor,
        });
      } else if (priorActor !== undefined && nextActor === undefined) {
        diffs.push({
          path: actorPath,
          kind: 'surface-removed',
          requiredBump: 'major',
          prior: priorActor,
          next: undefined,
        });
      } else if (priorActor !== undefined && nextActor !== undefined) {
        componentVersions.push({
          path: actorPath,
          priorVersion: priorActor.version,
          nextVersion: nextActor.version,
        });
        if (priorActor.name !== nextActor.name) {
          diffs.push({
            path: `${actorPath}.name`,
            kind: 'identity-changed',
            requiredBump: 'major',
            prior: priorActor.name,
            next: nextActor.name,
          });
        }
        if (priorActor.version !== nextActor.version) {
          diffs.push({
            path: `${actorPath}.version`,
            kind: 'authored-version-changed',
            requiredBump: 'none',
            prior: priorActor.version,
            next: nextActor.version,
          });
        }
      }

      const priorActorModels = priorActor?.models ?? {};
      const nextActorModels = nextActor?.models ?? {};
      for (const modelKey of new Set([
        ...Object.keys(priorActorModels),
        ...Object.keys(nextActorModels),
      ])) {
        modelComparisons.push({
          path: `${actorPath}.models.${modelKey}`,
          bumpKey: `actor:${accountName}:${actorName}:${priorActorModels[modelKey]?.modelName ?? nextActorModels[modelKey]?.modelName ?? modelKey}`,
          prior: priorActorModels[modelKey],
          next: nextActorModels[modelKey],
          adapterOwner: null,
        });
      }

      const priorSelections = priorActor?.selections ?? {};
      const nextSelections = nextActor?.selections ?? {};
      for (const selectionKey of new Set([
        ...Object.keys(priorSelections),
        ...Object.keys(nextSelections),
      ])) {
        const priorSelection = priorSelections[selectionKey];
        const nextSelection = nextSelections[selectionKey];
        const selectionPath = `${actorPath}.selections.${selectionKey}`;
        if (priorSelection === undefined && nextSelection !== undefined) {
          diffs.push({
            path: selectionPath,
            kind: 'surface-added',
            requiredBump: 'minor',
            prior: undefined,
            next: nextSelection,
          });
        } else if (priorSelection !== undefined && nextSelection === undefined) {
          diffs.push({
            path: selectionPath,
            kind: 'surface-removed',
            requiredBump: 'major',
            prior: priorSelection,
            next: undefined,
          });
        } else if (
          priorSelection !== undefined &&
          nextSelection !== undefined &&
          priorSelection.modelName !== nextSelection.modelName
        ) {
          diffs.push({
            path: `${selectionPath}.modelName`,
            kind: 'identity-changed',
            requiredBump: 'major',
            prior: priorSelection.modelName,
            next: nextSelection.modelName,
          });
        }
      }

      const priorQueries = priorActor?.queries ?? {};
      const nextQueries = nextActor?.queries ?? {};
      for (const queryKey of new Set([
        ...Object.keys(priorQueries),
        ...Object.keys(nextQueries),
      ])) {
        const priorQuery = priorQueries[queryKey];
        const nextQuery = nextQueries[queryKey];
        const queryPath = `${actorPath}.queries.${queryKey}`;
        if (priorQuery === undefined && nextQuery !== undefined) {
          diffs.push({
            path: queryPath,
            kind: 'surface-added',
            requiredBump: 'minor',
            prior: undefined,
            next: nextQuery,
          });
        } else if (priorQuery !== undefined && nextQuery === undefined) {
          diffs.push({
            path: queryPath,
            kind: 'surface-removed',
            requiredBump: 'major',
            prior: priorQuery,
            next: undefined,
          });
        } else if (priorQuery !== undefined && nextQuery !== undefined) {
          if (
            priorQuery.name !== nextQuery.name ||
            priorQuery.serviceName !== nextQuery.serviceName
          ) {
            diffs.push({
              path: queryPath,
              kind: 'identity-changed',
              requiredBump: 'major',
              prior: {
                name: priorQuery.name,
                serviceName: priorQuery.serviceName,
              },
              next: {
                name: nextQuery.name,
                serviceName: nextQuery.serviceName,
              },
            });
          }
          schemaComparisons.push({
            path: `${queryPath}.paramsJsonSchema`,
            prior: priorQuery.paramsJsonSchema,
            next: nextQuery.paramsJsonSchema,
          });
        }
      }

      const priorFrontends = priorActor?.frontends ?? {};
      const nextFrontends = nextActor?.frontends ?? {};
      for (const frontendName of new Set([
        ...Object.keys(priorFrontends),
        ...Object.keys(nextFrontends),
      ])) {
        const priorBinding = priorFrontends[frontendName];
        const nextBinding = nextFrontends[frontendName];
        const frontendPath = `${actorPath}.frontends.${frontendName}`;
        if (priorBinding === undefined && nextBinding !== undefined) {
          diffs.push({
            path: frontendPath,
            kind: 'surface-added',
            requiredBump: 'minor',
            prior: undefined,
            next: nextBinding,
          });
        } else if (priorBinding !== undefined && nextBinding === undefined) {
          diffs.push({
            path: frontendPath,
            kind: 'surface-removed',
            requiredBump: 'major',
            prior: priorBinding,
            next: undefined,
          });
        }

        const priorFrontend = priorBinding?.frontendController;
        const nextFrontend = nextBinding?.frontendController;
        if (priorFrontend !== undefined && nextFrontend !== undefined) {
          componentVersions.push({
            path: `${frontendPath}.frontendController`,
            priorVersion: priorFrontend.version,
            nextVersion: nextFrontend.version,
          });
          if (
            priorBinding?.name !== nextBinding?.name ||
            priorFrontend.accountName !== nextFrontend.accountName ||
            priorFrontend.actorName !== nextFrontend.actorName ||
            priorFrontend.frontendName !== nextFrontend.frontendName
          ) {
            diffs.push({
              path: frontendPath,
              kind: 'identity-changed',
              requiredBump: 'major',
              prior: {
                bindingName: priorBinding?.name,
                accountName: priorFrontend.accountName,
                actorName: priorFrontend.actorName,
                frontendName: priorFrontend.frontendName,
              },
              next: {
                bindingName: nextBinding?.name,
                accountName: nextFrontend.accountName,
                actorName: nextFrontend.actorName,
                frontendName: nextFrontend.frontendName,
              },
            });
          }
          if (priorFrontend.version !== nextFrontend.version) {
            diffs.push({
              path: `${frontendPath}.frontendController.version`,
              kind: 'authored-version-changed',
              requiredBump: 'none',
              prior: priorFrontend.version,
              next: nextFrontend.version,
            });
          }
          schemaComparisons.push({
            path: `${frontendPath}.frontendController.signatureJsonSchema`,
            prior: priorFrontend.signatureJsonSchema,
            next: nextFrontend.signatureJsonSchema,
          });
        }

        const priorFrontendModels = priorFrontend?.models ?? {};
        const nextFrontendModels = nextFrontend?.models ?? {};
        for (const modelKey of new Set([
          ...Object.keys(priorFrontendModels),
          ...Object.keys(nextFrontendModels),
        ])) {
          modelComparisons.push({
            path: `${frontendPath}.frontendController.models.${modelKey}`,
            bumpKey: `frontend:${accountName}:${actorName}:${frontendName}:${priorFrontendModels[modelKey]?.modelName ?? nextFrontendModels[modelKey]?.modelName ?? modelKey}`,
            prior: priorFrontendModels[modelKey],
            next: nextFrontendModels[modelKey],
            adapterOwner: null,
          });
        }

        const priorFrontendContracts = priorFrontend?.contracts ?? {};
        const nextFrontendContracts = nextFrontend?.contracts ?? {};
        for (const contractKey of new Set([
          ...Object.keys(priorFrontendContracts),
          ...Object.keys(nextFrontendContracts),
        ])) {
          contractComparisons.push({
            path: `${frontendPath}.frontendController.contracts.${contractKey}`,
            modelBumpPrefix: `frontend:${accountName}:${actorName}:${frontendName}:`,
            prior: priorFrontendContracts[contractKey],
            next: nextFrontendContracts[contractKey],
          });
        }
      }
    }
  }

  // 2 — Models compare their full encoded properties and indexes. Historical
  // definition ordering was normalized by makeSystemSpec; any remaining model
  // definition change requires a generation even when structurally compatible.
  for (const comparison of modelComparisons) {
    const priorModel = comparison.prior;
    const nextModel = comparison.next;
    if (priorModel === undefined && nextModel !== undefined) {
      requiresNewGeneration = true;
      modelBumps[comparison.bumpKey] = 'minor';
      diffs.push({
        path: comparison.path,
        kind: 'surface-added',
        requiredBump: 'minor',
        prior: undefined,
        next: nextModel,
      });
      continue;
    }
    if (priorModel !== undefined && nextModel === undefined) {
      requiresNewGeneration = true;
      modelBumps[comparison.bumpKey] = 'major';
      diffs.push({
        path: comparison.path,
        kind: 'surface-removed',
        requiredBump: 'major',
        prior: priorModel,
        next: undefined,
      });
      if (comparison.adapterOwner !== null) {
        for (const operationName of comparison.adapterOwner.operations) {
          const hasDirectEdge =
            comparison.adapterOwner.mutationAdapters?.[priorModel.modelName]?.[
              operationName
            ]?.some(
              edge =>
                edge.source.modelName === priorModel.modelName &&
                edge.source.modelVersion === priorModel.version &&
                edge.source.operationName === operationName,
            ) === true;
          if (!hasDirectEdge) {
            missingAdapters.push({
              controllerKind: comparison.adapterOwner.controllerKind,
              controllerName: comparison.adapterOwner.controllerName,
              modelName: priorModel.modelName,
              modelVersion: priorModel.version,
              operationName,
            });
          }
        }
      }
      continue;
    }
    if (priorModel === undefined || nextModel === undefined) {
      continue;
    }

    componentVersions.push({
      path: comparison.path,
      priorVersion: priorModel.version,
      nextVersion: nextModel.version,
    });
    if (!isEqual(priorModel, nextModel)) {
      requiresNewGeneration = true;
    }
    if (priorModel.version !== nextModel.version) {
      diffs.push({
        path: `${comparison.path}.version`,
        kind: 'authored-version-changed',
        requiredBump: 'none',
        prior: priorModel.version,
        next: nextModel.version,
      });
    }
    if (!isEqual(priorModel.historicalDefinitions, nextModel.historicalDefinitions)) {
      diffs.push({
        path: `${comparison.path}.historicalDefinitions`,
        kind: 'history-changed',
        requiredBump: 'none',
        prior: priorModel.historicalDefinitions,
        next: nextModel.historicalDefinitions,
      });
    }

    let modelBump: 'none' | 'minor' | 'major' = 'none';
    let createRequiresAdapter = false;
    let updateRequiresAdapter = false;
    let identityRequiresAdapter = false;
    if (
      priorModel.modelName !== nextModel.modelName ||
      priorModel.abbreviation !== nextModel.abbreviation
    ) {
      modelBump = 'major';
      identityRequiresAdapter = true;
      diffs.push({
        path: comparison.path,
        kind: 'identity-changed',
        requiredBump: 'major',
        prior: {
          modelName: priorModel.modelName,
          abbreviation: priorModel.abbreviation,
        },
        next: {
          modelName: nextModel.modelName,
          abbreviation: nextModel.abbreviation,
        },
      });
    }

    for (const propertyName of new Set([
      ...Object.keys(priorModel.properties),
      ...Object.keys(nextModel.properties),
    ])) {
      const priorProperty = priorModel.properties[propertyName];
      const nextProperty = nextModel.properties[propertyName];
      if (priorProperty === undefined && nextProperty !== undefined) {
        const propertyBump =
          Reflect.get(nextProperty, 'nullable') === true ? 'minor' : 'major';
        if (propertyBump === 'major') {
          createRequiresAdapter = true;
        }
        if (propertyBump === 'major' || modelBump === 'none') {
          modelBump = propertyBump;
        }
        diffs.push({
          path: `${comparison.path}.properties.${propertyName}`,
          kind: 'property-added',
          requiredBump: propertyBump,
          prior: undefined,
          next: nextProperty,
        });
      } else if (priorProperty !== undefined && nextProperty === undefined) {
        modelBump = 'major';
        createRequiresAdapter = true;
        updateRequiresAdapter = true;
        diffs.push({
          path: `${comparison.path}.properties.${propertyName}`,
          kind: 'property-removed',
          requiredBump: 'major',
          prior: priorProperty,
          next: undefined,
        });
      } else if (
        priorProperty !== undefined &&
        nextProperty !== undefined &&
        !isEqual(priorProperty, nextProperty)
      ) {
        let propertyBump: 'minor' | 'major' = 'minor';
        const priorKind = Reflect.get(priorProperty, 'kind');
        const nextKind = Reflect.get(nextProperty, 'kind');
        if (
          priorKind !== nextKind ||
          (Reflect.get(priorProperty, 'nullable') === true &&
            Reflect.get(nextProperty, 'nullable') !== true) ||
          (Reflect.get(priorProperty, 'unique') === false &&
            Reflect.get(nextProperty, 'unique') === true) ||
          (priorKind === 'json' &&
            !isEqual(
              Reflect.get(priorProperty, 'schema'),
              Reflect.get(nextProperty, 'schema'),
            ))
        ) {
          propertyBump = 'major';
        }

        if (
          propertyBump === 'minor' &&
          (priorKind === 'boolean' ||
            priorKind === 'integer' ||
            priorKind === 'number' ||
            priorKind === 'text' ||
            priorKind === 'date' ||
            priorKind === 'enum') &&
          Reflect.get(priorProperty, 'defaultValue') !== undefined &&
          Reflect.get(nextProperty, 'defaultValue') === undefined
        ) {
          propertyBump = 'major';
        }

        if (propertyBump === 'minor' && priorKind === 'enum') {
          const priorValues = Reflect.get(priorProperty, 'values');
          const nextValues = Reflect.get(nextProperty, 'values');
          if (
            !Array.isArray(priorValues) ||
            !Array.isArray(nextValues) ||
            priorValues.some(value => !nextValues.includes(value))
          ) {
            propertyBump = 'major';
          }
        }

        if (
          propertyBump === 'minor' &&
          priorKind === 'ref' &&
          (Reflect.get(priorProperty, 'abbreviation') !==
            Reflect.get(nextProperty, 'abbreviation') ||
            Reflect.get(priorProperty, 'targetTableName') !==
              Reflect.get(nextProperty, 'targetTableName') ||
            Reflect.get(priorProperty, 'targetColumnName') !==
              Reflect.get(nextProperty, 'targetColumnName') ||
            Reflect.get(priorProperty, 'relation') !==
              Reflect.get(nextProperty, 'relation') ||
            Reflect.get(priorProperty, 'inverse') !==
              Reflect.get(nextProperty, 'inverse'))
        ) {
          propertyBump = 'major';
        }

        if (
          propertyBump === 'minor' &&
          'abbreviation' in priorProperty &&
          Reflect.get(priorProperty, 'abbreviation') !==
            Reflect.get(nextProperty, 'abbreviation')
        ) {
          propertyBump = 'major';
        }
        if (propertyBump === 'major') {
          createRequiresAdapter = true;
          updateRequiresAdapter = true;
          modelBump = 'major';
        } else if (modelBump === 'none') {
          modelBump = 'minor';
        }
        diffs.push({
          path: `${comparison.path}.properties.${propertyName}`,
          kind:
            propertyBump === 'major'
              ? 'property-incompatible'
              : 'property-widened',
          requiredBump: propertyBump,
          prior: priorProperty,
          next: nextProperty,
        });
      }
    }

    const priorIndexes = new Map(
      priorModel.indexes.map(index => [index.name, index]),
    );
    const nextIndexes = new Map(
      nextModel.indexes.map(index => [index.name, index]),
    );
    for (const indexName of new Set([
      ...priorIndexes.keys(),
      ...nextIndexes.keys(),
    ])) {
      const priorIndex = priorIndexes.get(indexName);
      const nextIndex = nextIndexes.get(indexName);
      if (priorIndex === undefined && nextIndex !== undefined) {
        const indexBump = nextIndex.unique === true ? 'major' : 'minor';
        if (indexBump === 'major' || modelBump === 'none') {
          modelBump = indexBump;
        }
        diffs.push({
          path: `${comparison.path}.indexes.${indexName}`,
          kind: 'index-added',
          requiredBump: indexBump,
          prior: undefined,
          next: nextIndex,
        });
      } else if (priorIndex !== undefined && nextIndex === undefined) {
        if (modelBump === 'none') {
          modelBump = 'minor';
        }
        diffs.push({
          path: `${comparison.path}.indexes.${indexName}`,
          kind: 'index-removed',
          requiredBump: 'minor',
          prior: priorIndex,
          next: undefined,
        });
      } else if (
        priorIndex !== undefined &&
        nextIndex !== undefined &&
        !isEqual(priorIndex, nextIndex)
      ) {
        const indexBump =
          (priorIndex.unique !== true && nextIndex.unique === true) ||
          (nextIndex.unique === true &&
            !isEqual(priorIndex.columns, nextIndex.columns))
            ? 'major'
            : 'minor';
        if (indexBump === 'major' || modelBump === 'none') {
          modelBump = indexBump;
        }
        diffs.push({
          path: `${comparison.path}.indexes.${indexName}`,
          kind: indexBump === 'major' ? 'index-tightened' : 'index-changed',
          requiredBump: indexBump,
          prior: priorIndex,
          next: nextIndex,
        });
      }
    }
    modelBumps[comparison.bumpKey] = modelBump;

    if (comparison.adapterOwner !== null) {
      for (const operationName of comparison.adapterOwner.operations) {
        const requiresAdapter =
          identityRequiresAdapter ||
          ((operationName === 'create' ||
            operationName === 'replicateResource') &&
            createRequiresAdapter) ||
          (operationName === 'update' && updateRequiresAdapter);
        if (!requiresAdapter) {
          continue;
        }
        const hasDirectEdge =
          comparison.adapterOwner.mutationAdapters?.[priorModel.modelName]?.[
            operationName
          ]?.some(
            edge =>
              edge.source.modelName === priorModel.modelName &&
              edge.source.modelVersion === priorModel.version &&
              edge.source.operationName === operationName,
          ) === true;
        if (!hasDirectEdge) {
          missingAdapters.push({
            controllerKind: comparison.adapterOwner.controllerKind,
            controllerName: comparison.adapterOwner.controllerName,
            modelName: priorModel.modelName,
            modelVersion: priorModel.version,
            operationName,
          });
        }
      }
    }
  }

  // 3 and 4 — Contracts keep payload directionality separate from mutation
  // slot membership. Mutation slot paths include Struct keys, Tuple indexes, or
  // Array item positions so additions and reorderings are exact major diffs.
  for (const comparison of contractComparisons) {
    const priorContract = comparison.prior;
    const nextContract = comparison.next;
    if (priorContract === undefined && nextContract !== undefined) {
      diffs.push({
        path: comparison.path,
        kind: 'surface-added',
        requiredBump: 'minor',
        prior: undefined,
        next: nextContract,
      });
      continue;
    }
    if (priorContract !== undefined && nextContract === undefined) {
      diffs.push({
        path: comparison.path,
        kind: 'surface-removed',
        requiredBump: 'major',
        prior: priorContract,
        next: undefined,
      });
      continue;
    }
    if (priorContract === undefined || nextContract === undefined) {
      continue;
    }

    componentVersions.push({
      path: comparison.path,
      priorVersion: priorContract.version,
      nextVersion: nextContract.version,
    });
    if (priorContract.version !== nextContract.version) {
      diffs.push({
        path: `${comparison.path}.version`,
        kind: 'authored-version-changed',
        requiredBump: 'none',
        prior: priorContract.version,
        next: nextContract.version,
      });
    }
    if (priorContract.commandName !== nextContract.commandName) {
      diffs.push({
        path: `${comparison.path}.commandName`,
        kind: 'identity-changed',
        requiredBump: 'major',
        prior: priorContract.commandName,
        next: nextContract.commandName,
      });
    }
    schemaComparisons.push({
      path: `${comparison.path}.payloadJsonSchema`,
      prior: priorContract.payloadJsonSchema,
      next: nextContract.payloadJsonSchema,
    });

    if (
      (priorContract.mutationsJsonSchema === null) !==
      (nextContract.mutationsJsonSchema === null)
    ) {
      diffs.push({
        path: `${comparison.path}.mutationsJsonSchema`,
        kind: 'mutation-membership-changed',
        requiredBump: 'major',
        prior: priorContract.mutationsJsonSchema,
        next: nextContract.mutationsJsonSchema,
      });
    } else if (
      priorContract.mutationsJsonSchema !== null &&
      nextContract.mutationsJsonSchema !== null &&
      !isEqual(
        priorContract.mutationsJsonSchema,
        nextContract.mutationsJsonSchema,
      )
    ) {
      const priorSlots: {
        path: string;
        modelName: string;
        modelVersion: string;
        operationName: string;
      }[] = [];
      const nextSlots: {
        path: string;
        modelName: string;
        modelVersion: string;
        operationName: string;
      }[] = [];
      const priorStack: { path: string; value: unknown }[] = [
        { path: '$', value: priorContract.mutationsJsonSchema },
      ];
      while (priorStack.length > 0) {
        const entry = priorStack.pop();
        if (
          entry === undefined ||
          typeof entry.value !== 'object' ||
          entry.value === null
        ) {
          continue;
        }
        const properties = Reflect.get(entry.value, 'properties');
        if (typeof properties === 'object' && properties !== null) {
          const modelNames = Reflect.get(
            Reflect.get(properties, 'modelName') ?? {},
            'enum',
          );
          const modelVersions = Reflect.get(
            Reflect.get(properties, 'modelVersion') ?? {},
            'enum',
          );
          const operationNames = Reflect.get(
            Reflect.get(properties, 'operationName') ?? {},
            'enum',
          );
          if (
            Array.isArray(modelNames) &&
            typeof modelNames[0] === 'string' &&
            Array.isArray(modelVersions) &&
            typeof modelVersions[0] === 'string' &&
            Array.isArray(operationNames) &&
            typeof operationNames[0] === 'string'
          ) {
            priorSlots.push({
              path: entry.path,
              modelName: modelNames[0],
              modelVersion: modelVersions[0],
              operationName: operationNames[0],
            });
          }
        }
        for (const [key, value] of Object.entries(entry.value)) {
          priorStack.push({ path: `${entry.path}.${key}`, value });
        }
      }
      const nextStack: { path: string; value: unknown }[] = [
        { path: '$', value: nextContract.mutationsJsonSchema },
      ];
      while (nextStack.length > 0) {
        const entry = nextStack.pop();
        if (
          entry === undefined ||
          typeof entry.value !== 'object' ||
          entry.value === null
        ) {
          continue;
        }
        const properties = Reflect.get(entry.value, 'properties');
        if (typeof properties === 'object' && properties !== null) {
          const modelNames = Reflect.get(
            Reflect.get(properties, 'modelName') ?? {},
            'enum',
          );
          const modelVersions = Reflect.get(
            Reflect.get(properties, 'modelVersion') ?? {},
            'enum',
          );
          const operationNames = Reflect.get(
            Reflect.get(properties, 'operationName') ?? {},
            'enum',
          );
          if (
            Array.isArray(modelNames) &&
            typeof modelNames[0] === 'string' &&
            Array.isArray(modelVersions) &&
            typeof modelVersions[0] === 'string' &&
            Array.isArray(operationNames) &&
            typeof operationNames[0] === 'string'
          ) {
            nextSlots.push({
              path: entry.path,
              modelName: modelNames[0],
              modelVersion: modelVersions[0],
              operationName: operationNames[0],
            });
          }
        }
        for (const [key, value] of Object.entries(entry.value)) {
          nextStack.push({ path: `${entry.path}.${key}`, value });
        }
      }
      let mutationBump: 'none' | 'minor' | 'major' = 'none';
      if (priorSlots.length !== nextSlots.length) {
        mutationBump = 'major';
      } else {
        for (const [slotIndex, priorSlot] of priorSlots.entries()) {
          const nextSlot = nextSlots[slotIndex];
          if (
            nextSlot === undefined ||
            priorSlot.path !== nextSlot.path ||
            priorSlot.modelName !== nextSlot.modelName ||
            priorSlot.operationName !== nextSlot.operationName
          ) {
            mutationBump = 'major';
            break;
          }
          if (priorSlot.modelVersion !== nextSlot.modelVersion) {
            const inheritedBump =
              modelBumps[`${comparison.modelBumpPrefix}${priorSlot.modelName}`] ??
              'none';
            if (inheritedBump === 'major') {
              mutationBump = 'major';
            } else if (
              inheritedBump === 'minor' &&
              mutationBump === 'none'
            ) {
              mutationBump = 'minor';
            }
          }
        }
      }
      if (priorSlots.length === 0 || nextSlots.length === 0) {
        mutationBump = 'major';
      }
      diffs.push({
        path: `${comparison.path}.mutationsJsonSchema`,
        kind:
          mutationBump === 'major'
            ? 'mutation-membership-changed'
            : 'mutation-model-version-changed',
        requiredBump: mutationBump,
        prior: priorSlots,
        next: nextSlots,
      });
    }
  }

  // 3 — Directional JSON Schema compatibility. This covers the Effect JSON
  // Schema shapes emitted for payloads, query params, and signatures: object
  // property membership, required fields, enum widening, nullable anyOf
  // widening, and exact primitive constraints.
  for (const comparison of schemaComparisons) {
    if (isEqual(comparison.prior, comparison.next)) {
      continue;
    }
    let compatible = true;
    const stack: { prior: unknown; next: unknown }[] = [
      { prior: comparison.prior, next: comparison.next },
    ];
    while (stack.length > 0 && compatible) {
      const entry = stack.pop();
      if (entry === undefined || isEqual(entry.prior, entry.next)) {
        continue;
      }
      if (
        typeof entry.prior !== 'object' ||
        entry.prior === null ||
        typeof entry.next !== 'object' ||
        entry.next === null
      ) {
        compatible = false;
        break;
      }

      const priorAnyOf = Reflect.get(entry.prior, 'anyOf');
      const nextAnyOf = Reflect.get(entry.next, 'anyOf');
      if (Array.isArray(priorAnyOf) || Array.isArray(nextAnyOf)) {
        const priorAlternatives = Array.isArray(priorAnyOf)
          ? priorAnyOf
          : [entry.prior];
        const nextAlternatives = Array.isArray(nextAnyOf)
          ? nextAnyOf
          : [entry.next];
        if (
          priorAlternatives.some(
            priorAlternative =>
              !nextAlternatives.some(nextAlternative =>
                isEqual(priorAlternative, nextAlternative),
              ),
          )
        ) {
          compatible = false;
        }
        continue;
      }

      const priorEnum = Reflect.get(entry.prior, 'enum');
      const nextEnum = Reflect.get(entry.next, 'enum');
      if (Array.isArray(priorEnum) || Array.isArray(nextEnum)) {
        if (
          !Array.isArray(priorEnum) ||
          !Array.isArray(nextEnum) ||
          priorEnum.some(value =>
            nextEnum.every(nextValue => !isEqual(value, nextValue)),
          )
        ) {
          compatible = false;
        }
        continue;
      }

      const priorType = Reflect.get(entry.prior, 'type');
      const nextType = Reflect.get(entry.next, 'type');
      const priorTypes = Array.isArray(priorType)
        ? priorType
        : priorType === undefined
          ? []
          : [priorType];
      const nextTypes = Array.isArray(nextType)
        ? nextType
        : nextType === undefined
          ? []
          : [nextType];
      if (
        priorTypes.some(type => !nextTypes.includes(type)) ||
        (priorTypes.length === 0) !== (nextTypes.length === 0)
      ) {
        compatible = false;
        break;
      }

      const priorProperties = Reflect.get(entry.prior, 'properties');
      const nextProperties = Reflect.get(entry.next, 'properties');
      if (
        typeof priorProperties === 'object' &&
        priorProperties !== null
      ) {
        if (typeof nextProperties !== 'object' || nextProperties === null) {
          compatible = false;
          break;
        }
        const priorRequired = Reflect.get(entry.prior, 'required');
        const nextRequired = Reflect.get(entry.next, 'required');
        const priorRequiredNames = Array.isArray(priorRequired)
          ? priorRequired
          : [];
        const nextRequiredNames = Array.isArray(nextRequired)
          ? nextRequired
          : [];
        if (
          nextRequiredNames.some(
            name =>
              typeof name === 'string' &&
              !priorRequiredNames.includes(name),
          )
        ) {
          compatible = false;
          break;
        }
        for (const [propertyName, priorProperty] of Object.entries(
          priorProperties,
        )) {
          const nextProperty = Reflect.get(nextProperties, propertyName);
          if (nextProperty === undefined) {
            compatible = false;
            break;
          }
          stack.push({ prior: priorProperty, next: nextProperty });
        }
      }

      const priorItems = Reflect.get(entry.prior, 'items');
      const nextItems = Reflect.get(entry.next, 'items');
      if (priorItems !== undefined) {
        if (nextItems === undefined) {
          compatible = false;
          break;
        }
        if (Array.isArray(priorItems)) {
          if (
            !Array.isArray(nextItems) ||
            nextItems.length < priorItems.length
          ) {
            compatible = false;
            break;
          }
          for (const [itemIndex, priorItem] of priorItems.entries()) {
            stack.push({ prior: priorItem, next: nextItems[itemIndex] });
          }
        } else {
          stack.push({ prior: priorItems, next: nextItems });
        }
      }

      for (const constraintName of [
        'const',
        'format',
        'maximum',
        'maxLength',
        'minimum',
        'minLength',
        'pattern',
      ]) {
        const priorConstraint = Reflect.get(entry.prior, constraintName);
        const nextConstraint = Reflect.get(entry.next, constraintName);
        if (!isEqual(priorConstraint, nextConstraint)) {
          compatible = false;
          break;
        }
      }
      if (
        Reflect.get(entry.prior, 'additionalProperties') !== false &&
        Reflect.get(entry.next, 'additionalProperties') === false
      ) {
        compatible = false;
      }
    }
    diffs.push({
      path: comparison.path,
      kind: compatible ? 'schema-widened' : 'schema-incompatible',
      requiredBump: compatible ? 'minor' : 'major',
      prior: comparison.prior,
      next: comparison.next,
    });
  }

  // 6 — Structural severity propagates to every existing owning component.
  // Version-only diffs remain `none`, so a patch bump can represent logic that
  // the comparator cannot infer. Under-bump entries are data for production;
  // development callers can report structural compatibility without enforcing
  // authored churn.
  for (const component of componentVersions) {
    let componentBump: 'none' | 'minor' | 'major' = 'none';
    for (const diff of diffs) {
      if (
        diff.path !== component.path &&
        !diff.path.startsWith(`${component.path}.`)
      ) {
        continue;
      }
      if (diff.requiredBump === 'major') {
        componentBump = 'major';
        break;
      }
      if (diff.requiredBump === 'minor') {
        componentBump = 'minor';
      }
    }
    const priorCore = component.priorVersion.split(/[+-]/u)[0] ?? '';
    const nextCore = component.nextVersion.split(/[+-]/u)[0] ?? '';
    const priorParts = priorCore.split('.').map(part => Number(part));
    const nextParts = nextCore.split('.').map(part => Number(part));
    const priorMajor = priorParts[0];
    const priorMinor = priorParts[1];
    const nextMajor = nextParts[0];
    const nextMinor = nextParts[1];
    const validVersions =
      semVerPattern.test(component.priorVersion) &&
      semVerPattern.test(component.nextVersion) &&
      priorParts.length === 3 &&
      nextParts.length === 3 &&
      priorParts.every(Number.isSafeInteger) &&
      nextParts.every(Number.isSafeInteger) &&
      priorMajor !== undefined &&
      priorMinor !== undefined &&
      nextMajor !== undefined &&
      nextMinor !== undefined;
    if (!validVersions) {
      diffs.push({
        path: `${component.path}.version`,
        kind: 'invalid-semver',
        requiredBump: componentBump,
        prior: component.priorVersion,
        next: component.nextVersion,
      });
      continue;
    }
    if (componentBump === 'none') {
      continue;
    }
    const meetsFloor =
      componentBump === 'major'
        ? nextMajor > priorMajor
        : nextMajor > priorMajor ||
          (nextMajor === priorMajor && nextMinor > priorMinor);
    if (!meetsFloor) {
      diffs.push({
        path: `${component.path}.version`,
        kind: 'version-under-bumped',
        requiredBump: componentBump,
        prior: component.priorVersion,
        next: component.nextVersion,
      });
    }
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

  const systemPriorCore = prior.version.split(/[+-]/u)[0] ?? '';
  const systemNextCore = next.version.split(/[+-]/u)[0] ?? '';
  const systemPriorParts = systemPriorCore
    .split('.')
    .map(part => Number(part));
  const systemNextParts = systemNextCore.split('.').map(part => Number(part));
  const systemPriorMajor = systemPriorParts[0];
  const systemPriorMinor = systemPriorParts[1];
  const systemNextMajor = systemNextParts[0];
  const systemNextMinor = systemNextParts[1];
  const validSystemVersions =
    semVerPattern.test(prior.version) &&
    semVerPattern.test(next.version) &&
    systemPriorParts.length === 3 &&
    systemNextParts.length === 3 &&
    systemPriorParts.every(Number.isSafeInteger) &&
    systemNextParts.every(Number.isSafeInteger) &&
    systemPriorMajor !== undefined &&
    systemPriorMinor !== undefined &&
    systemNextMajor !== undefined &&
    systemNextMinor !== undefined;
  const systemMeetsFloor =
    requiredBump === 'none' ||
    (validSystemVersions &&
      (requiredBump === 'major'
        ? systemNextMajor > systemPriorMajor
        : systemNextMajor > systemPriorMajor ||
          (systemNextMajor === systemPriorMajor &&
            systemNextMinor > systemPriorMinor)));
  if (!validSystemVersions) {
    diffs.push({
      path: 'version',
      kind: 'invalid-semver',
      requiredBump,
      prior: prior.version,
      next: next.version,
    });
  } else if (!systemMeetsFloor) {
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
});
