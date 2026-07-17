import type { Async } from '@zerospin/core/async/Async';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import { makeMutations } from '@zerospin/core/contracts/makeMutations';
import type {
  IAccountCommand,
  IAnyMutation,
} from '@zerospin/core/contracts/types';
import type { IDb } from '@zerospin/core/drizzle/types';
import { makeAbbreviationIdSchema } from '@zerospin/core/models/makeIdSchema';
import type {
  IEncodedResourceShape,
  IServiceCursorId,
} from '@zerospin/core/models/types';
import type { CuidFactory } from '@zerospin/core/services/CuidFactory';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { getByKeyOrThrow } from '@zerospin/core/utils/getByKeyOrThrow';
import {
  mapParseError,
  ZerospinError,
  type IAnyError,
  type IAnyErrorJson,
} from '@zerospin/error';
import { eq } from 'drizzle-orm';
import { Effect, Either, Schema } from 'effect';
import { system } from 'system';

import type { IServiceBlock } from '../../types.js';
import { getServiceRepo } from '../../ServiceRepo/getServiceRepo/getServiceRepo.js';
import { ServiceRepo } from '../../ServiceRepo/ServiceRepo.js';
import { accountRepoDrizzleSchemas } from '../AccountRepo.js';

/*
 * 1. Prepare every command's account-contract mutations without resource RPCs.
 * 2. Validate replication ownership and collect refs with source positions.
 * 3. Group refs across the batch in first-appearance service order.
 * 4. Read subscription watermarks and settle grouped ServiceRepo RPCs concurrently.
 * 5. Map missing, failed, and decoded resource results back to owning commands.
 * 6. Retain only service alignments still referenced by successful commands.
 * 7. Return command outcomes and ordered alignment data to the transaction.
 */
export const prepareAccountCommands = Effect.fn(
  'AccountRepo.prepareAccountCommands',
)(function* (props: {
  generationId: string;
  accountName: string;
  commands: readonly IAccountCommand[];
  db: IDb;
}): Effect.fn.Return<
  Readonly<{
    preparedCommands: readonly Readonly<{
      command: IAccountCommand;
      mutations: Either.Either<
        Readonly<{ mutations: readonly IAnyMutation[] }>,
        IAnyError
      >;
    }>[];
    serviceAlignments: readonly Readonly<{
      serviceRepoName: string;
      serviceName: string;
      currentServiceIndex: number | null;
      lastServiceCursor: IServiceCursorId;
      serviceIndex: number;
      serviceBlocks: readonly IServiceBlock[];
    }>[];
  }>,
  IAnyError,
  Async | CuidFactory
> {
  const { accountName, commands, db, generationId } = props;

  // 1 — run every contract first so no ServiceRepo snapshot occurs inside the command mutation loop
  const accountController = yield* getByKeyOrThrow({
    record: system.accountControllers,
    key: accountName,
    recordKind: 'accountControllers',
  });
  const preparedCommands: Array<
    {
      command: IAccountCommand;
      mutations: Either.Either<
        { mutations: IAnyMutation[] },
        IAnyError
      >;
    }
  > = [];

  for (const command of commands) {
    const preparedMutations = yield* Effect.gen(function* () {
      const contract = Object.values(accountController.contracts).find(
        candidate => candidate.commandName === command.commandName,
      );
      if (contract === undefined) {
        return yield* new ZerospinError({
          code: 'account-contract-not-found',
          message: `Account contract "${command.commandName}" was not found`,
        });
      }
      const { mutations } = yield* makeMutations({
        contract,
        models: accountController.models,
        owner: { kind: 'account' },
        command,
      });
      return { mutations: [...mutations] };
    }).pipe(Effect.either);

    preparedCommands.push({
      command,
      mutations: preparedMutations,
    });
  }

  // 2 — keep command and mutation positions so every grouped result returns to its owner
  const serviceGroups: Array<{
    serviceRepoName: string;
    serviceName: string;
    resources: Array<{
      commandIndex: number;
      mutationIndex: number;
      modelName: string;
      resourceId: string;
    }>;
  }> = [];
  for (const [commandIndex, preparedCommand] of preparedCommands.entries()) {
    if (Either.isLeft(preparedCommand.mutations)) {
      continue;
    }
    const mutations = preparedCommand.mutations.right.mutations;
    const commandRefs: Array<{
      serviceRepoName: string;
      serviceName: string;
      commandIndex: number;
      mutationIndex: number;
      modelName: string;
      resourceId: string;
    }> = [];
    const validated = yield* Effect.gen(function* () {
      for (const [mutationIndex, mutation] of mutations.entries()) {
        if (mutation.operationName !== 'replicateResource') {
          continue;
        }
        const serviceController = yield* getByKeyOrThrow({
          record: system.serviceControllers,
          key: mutation.operation.serviceName,
          recordKind: 'service controllers',
        });
        const serviceModel = yield* getByKeyOrThrow({
          record: serviceController.models,
          key: mutation.model.modelName,
          recordKind: `models owned by service ${mutation.operation.serviceName}`,
        });
        if (serviceModel !== mutation.model) {
          return yield* new ZerospinError({
            code: 'replication-service-model-mismatch',
            message: `Replication model "${mutation.model.modelName}" does not match the model owned by service "${mutation.operation.serviceName}"`,
          });
        }
        const serviceRepoName = yield* ServiceRepo.repoUtils.nameUtils.makeName({
          generationId,
          serviceName: mutation.operation.serviceName,
        });
        commandRefs.push({
          serviceRepoName,
          serviceName: mutation.operation.serviceName,
          commandIndex,
          mutationIndex,
          modelName: mutation.model.modelName,
          resourceId: mutation.resourceId,
        });
      }
    }).pipe(Effect.either);
    if (Either.isLeft(validated)) {
      preparedCommand.mutations = Either.left(validated.left);
      continue;
    }

    // 3 — append services and refs by first appearance; duplicate refs stay positional
    for (const commandRef of commandRefs) {
      let serviceGroup = serviceGroups.find(
        candidate => candidate.serviceRepoName === commandRef.serviceRepoName,
      );
      if (serviceGroup === undefined) {
        serviceGroup = {
          serviceRepoName: commandRef.serviceRepoName,
          serviceName: commandRef.serviceName,
          resources: [],
        };
        serviceGroups.push(serviceGroup);
      }
      serviceGroup.resources.push(commandRef);
    }
  }

  // 4 — Effect.forEach preserves group order while allowing at most six outbound Worker requests
  const groupedSnapshots = yield* Effect.forEach(
    serviceGroups,
    serviceGroup =>
      Effect.gen(function* () {
        const persistedServiceRepoName = yield* Schema.decodeUnknown(
          makeAbbreviationIdSchema(coreAbbreviations.serviceRepo),
        )(serviceGroup.serviceRepoName).pipe(
          mapParseError({
            code: 'account-service-repo-name-decode-failed',
            prefix: 'Failed to decode AccountRepo serviceRepoName',
          }),
        );
        const subscription = db
          .select()
          .from(accountRepoDrizzleSchemas.serviceSubscriptions)
          .where(
            eq(
              accountRepoDrizzleSchemas.serviceSubscriptions.serviceRepoName,
              persistedServiceRepoName,
            ),
          )
          .get();
        if (
          subscription !== undefined &&
          subscription.serviceName !== serviceGroup.serviceName
        ) {
          return yield* new ZerospinError({
            code: 'account-service-subscription-name-mismatch',
            message: `Subscription ${serviceGroup.serviceRepoName} belongs to service "${subscription.serviceName}", not "${serviceGroup.serviceName}"`,
          });
        }
        const currentServiceIndex =
          subscription?.currentServiceIndex ?? null;
        const serviceRepo = yield* getServiceRepo({
          key: {
            generationId,
            serviceName: serviceGroup.serviceName,
          },
        });
        const requestedResources: Array<{
          modelName: string;
          resourceId: string;
        }> = [];
        for (const resource of serviceGroup.resources) {
          requestedResources.push({
            modelName: resource.modelName,
            resourceId: resource.resourceId,
          });
        }
        const snapshot = yield* makeAsync<
          Schema.EitherEncoded<
            Readonly<{
              resources: readonly (
                | Readonly<{
                    status: 'found';
                    modelName: string;
                    resourceId: string;
                    resource: IEncodedResourceShape;
                  }>
                | Readonly<{
                    status: 'missing';
                    modelName: string;
                    resourceId: string;
                    failure: IAnyErrorJson;
                  }>
              )[];
              serviceBlocks: readonly IServiceBlock[];
              lastServiceCursor: IServiceCursorId;
              serviceIndex: number;
            }>,
            IAnyErrorJson
          >
        >(() =>
          serviceRepo.getReplicatedResources({
            currentServiceIndex,
            resources: requestedResources,
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        return { currentServiceIndex, snapshot };
      }).pipe(Effect.either),
    { concurrency: 6 },
  );

  // 5 — fail only commands that own a failed or missing result, then inject validated canonical snapshots into the surviving mutations
  for (const [serviceGroupIndex, groupedSnapshot] of groupedSnapshots.entries()) {
    const serviceGroup = serviceGroups[serviceGroupIndex];
    if (serviceGroup === undefined) {
      continue;
    }
    if (Either.isLeft(groupedSnapshot)) {
      for (const resourceRef of serviceGroup.resources) {
        const preparedCommand = preparedCommands[resourceRef.commandIndex];
        if (
          preparedCommand !== undefined &&
          Either.isRight(preparedCommand.mutations)
        ) {
          preparedCommand.mutations = Either.left(groupedSnapshot.left);
        }
      }
      continue;
    }

    for (const [resourceIndex, resourceRef] of serviceGroup.resources.entries()) {
      const preparedCommand = preparedCommands[resourceRef.commandIndex];
      if (
        preparedCommand === undefined ||
        Either.isLeft(preparedCommand.mutations)
      ) {
        continue;
      }
      const mutation =
        preparedCommand.mutations.right.mutations[resourceRef.mutationIndex];
      const resourceResult =
        groupedSnapshot.right.snapshot.resources[resourceIndex];
      if (
        mutation === undefined ||
        mutation.operationName !== 'replicateResource' ||
        resourceResult === undefined ||
        resourceResult.modelName !== resourceRef.modelName ||
        resourceResult.resourceId !== resourceRef.resourceId
      ) {
        preparedCommand.mutations = Either.left(
          new ZerospinError({
            code: 'replication-preparation-position-mismatch',
            message: `Grouped replication result did not match command ${preparedCommand.command.id} mutation ${resourceRef.mutationIndex}`,
          }),
        );
        continue;
      }
      if (resourceResult.status === 'missing') {
        preparedCommand.mutations = Either.left(
          new ZerospinError(resourceResult.failure),
        );
        continue;
      }
      const decodedResource = yield* Schema.validate(
        mutation.model.resourceSchema,
      )(resourceResult.resource).pipe(
        mapParseError({
          code: 'replicated-service-resource-decode-failed',
          prefix: `Failed to decode ${mutation.operation.serviceName}.${mutation.model.modelName}.${mutation.resourceId}`,
        }),
        Effect.either,
      );
      if (Either.isLeft(decodedResource)) {
        preparedCommand.mutations = Either.left(decodedResource.left);
        continue;
      }
      preparedCommand.mutations.right.mutations[resourceRef.mutationIndex] = {
        ...mutation,
        operation: {
          ...mutation.operation,
          resource: decodedResource.right,
        },
      };
    }
  }

  // 6 — a service with no surviving owning command performs no alignment or watermark write
  const serviceAlignments: Array<{
    serviceRepoName: string;
    serviceName: string;
    currentServiceIndex: number | null;
    lastServiceCursor: IServiceCursorId;
    serviceIndex: number;
    serviceBlocks: readonly IServiceBlock[];
  }> = [];
  for (const [serviceGroupIndex, serviceGroup] of serviceGroups.entries()) {
    const groupedSnapshot = groupedSnapshots[serviceGroupIndex];
    if (groupedSnapshot === undefined || Either.isLeft(groupedSnapshot)) {
      continue;
    }
    let hasSuccessfulOwner = false;
    for (const resourceRef of serviceGroup.resources) {
      const preparedCommand = preparedCommands[resourceRef.commandIndex];
      if (
        preparedCommand !== undefined &&
        Either.isRight(preparedCommand.mutations)
      ) {
        hasSuccessfulOwner = true;
        break;
      }
    }
    if (!hasSuccessfulOwner) {
      continue;
    }
    serviceAlignments.push({
      serviceRepoName: serviceGroup.serviceRepoName,
      serviceName: serviceGroup.serviceName,
      currentServiceIndex: groupedSnapshot.right.currentServiceIndex,
      lastServiceCursor: groupedSnapshot.right.snapshot.lastServiceCursor,
      serviceIndex: groupedSnapshot.right.snapshot.serviceIndex,
      serviceBlocks: groupedSnapshot.right.snapshot.serviceBlocks,
    });
  }

  // 7 — the write transaction receives no RPC effects, only ordered prepared commands and alignments
  return { preparedCommands, serviceAlignments };
});
