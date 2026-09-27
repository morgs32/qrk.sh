import { resolveAggregateActorVersion } from '@zerospin/core/aggregateActor/getAggregateActorVersion';
import { getCommandContracts } from '@zerospin/core/automation/getCommandContracts';
import {
  AggregateChainedCommandSchema,
  EncodedAggregateCommandSchema,
} from '@zerospin/core/contracts/CommandSchema';
import { decodePayload } from '@zerospin/core/contracts/decodePayload/decodePayload';
import { encodeMutation } from '@zerospin/core/contracts/encodeAppliedMutation';
import { encodeFailure } from '@zerospin/core/contracts/failureCodec';
import { makeMutations } from '@zerospin/core/contracts/make/makeMutations';
import { prepareReplayAppliedMutation } from '@zerospin/core/contracts/prepareReplayAppliedMutation';
import type { IContract } from '@zerospin/core/contracts/types';
import { validateAggregateCommand } from '@zerospin/core/contracts/validateAggregateCommand';
import type { IDb } from '@zerospin/core/drizzle/types';
import { EncodedResourceSchema } from '@zerospin/core/models/EncodedResourceSchema';
import { getByKeyOrThrow } from '@zerospin/core/utils/getByKeyOrThrow';
import {
  encodeError,
  isZerospinError,
  makeZerospinError,
  mapParseError,
  PublicFailureSchema,
  type IAnyError,
} from '@zerospin/error';
import config from 'config';
import { eq } from 'drizzle-orm';
import { Effect, Result, Schema, type Context, type Semaphore } from 'effect';

import { aggregateChainDbConfig } from '../../AggregateChain/aggregateChainDbConfig.js';
import { aggregateVersionRepoDbConfig } from '../aggregateVersionRepoDbConfig.js';
import { getReplicatedResources } from '../getReplicatedResources/getReplicatedResources.js';

import { executeCommandsTx } from './executeCommandsTx.js';

const { system } = config;

/** Prepare supplied admitted rows and atomically commit contiguous version-owned results.
 * Committed rows are skipped under the execution permit; a later failure preserves the committed prefix.
 *
 * 1. Skip committed rows under the execution permit.
 * 2. Prepare immutable execution inputs.
 * 3. Execute contiguous inputs and atomically commit terminal history with resource state.
 */
export const executeCommands = Effect.fn(
  'AggregateVersionRepo.executeCommands',
)(function* (props: {
  commands: readonly (typeof aggregateChainDbConfig.schema.commands.$inferSelect)[];
  db: IDb;
  execution: Semaphore.Semaphore;
  key: {
    systemId: string;
    aggregateId: string;
    aggregateName: string;
    aggregateVersion: string;
  };
}) {
  if (props.commands.length === 0) return;
  const { db, key, execution, commands } = props;
  const latestAggregate = yield* getByKeyOrThrow({
    record: system.aggregates,
    key: key.aggregateName,
    recordKind: 'aggregates',
  });
  const aggregate = yield* getByKeyOrThrow({
    record: latestAggregate,
    key: key.aggregateVersion,
    recordKind: 'listed versions',
  });

  // 1 — re-read the durable head after acquiring the execution permit
  yield* execution.withPermits(1)(
    Effect.gen(function* () {
      let head = db
        .select()
        .from(aggregateVersionRepoDbConfig.schema.head)
        .where(eq(aggregateVersionRepoDbConfig.schema.head.singletonId, 1))
        .get();
      const tail = commands.filter(
        row => row.aggregateIndex > (head?.aggregateIndex ?? 0),
      );
      if (tail.length === 0) return;
      const context: Context.Context<unknown> =
        yield* system.runtime.contextEffect;

      // 2 — adapt one payload, run its synchronous program, and read pinned replica copies
      for (const row of tail) {
        yield* Effect.scoped(
          Effect.gen(function* () {
            const preparedPage = yield* Effect.forEach([row], row =>
              Effect.gen(function* () {
                const startedAt = new Date();
                const decoded = yield* aggregateChainDbConfig.tables.commands
                  .decodeRow(row)
                  .pipe(
                    mapParseError({
                      code: 'command-row-invalid',
                      prefix: 'Invalid command row',
                    }),
                  );
                const source = yield* Schema.decodeUnknownEffect(
                  EncodedAggregateCommandSchema,
                )(decoded).pipe(
                  mapParseError({
                    code: 'aggregate-admitted-input-invalid',
                    prefix: 'Invalid admitted input',
                  }),
                );
                const command = yield* Schema.decodeUnknownEffect(
                  Schema.toType(AggregateChainedCommandSchema),
                )({
                  ...source,
                  aggregateIndex: row.aggregateIndex,
                  admission: decoded.admission,
                  execution: { status: 'pending' },
                  dispositionHash: null,
                }).pipe(
                  mapParseError({
                    code: 'aggregate-admitted-occurrence-invalid',
                    prefix: 'Invalid admitted occurrence',
                  }),
                );
                if (command.admission.status === 'failed') {
                  return {
                    command,
                    startedAt,
                    mutations: [],
                    failure: null,
                    guard: () => Effect.void,
                  };
                }
                const infrastructure: { failure: IAnyError | null } = {
                  failure: null,
                };
                const prepared = yield* Effect.gen(function* () {
                  const actor = yield* resolveAggregateActorVersion(
                    latestAggregate,
                    command,
                  );
                  const sourceContract = yield* getByKeyOrThrow({
                    record: getCommandContracts(actor, command),
                    key: command.commandName,
                    recordKind: 'actor-contract',
                  });
                  const targetActor = aggregate.actors[actor.name];
                  const contract =
                    targetActor === undefined
                      ? undefined
                      : getCommandContracts(targetActor, command)[
                          command.commandName
                        ];
                  if (contract === undefined) {
                    return yield* Effect.fail(
                      makeZerospinError('actor-contract-unsupported'),
                    );
                  }
                  let ancestor: IContract | undefined = contract;
                  while (
                    ancestor !== undefined &&
                    ancestor !== sourceContract
                  ) {
                    ancestor = ancestor.previous;
                  }
                  if (ancestor === undefined) {
                    ancestor = sourceContract;
                    while (ancestor !== undefined && ancestor !== contract) {
                      ancestor = ancestor.previous;
                    }
                  }
                  if (ancestor === undefined) {
                    return yield* Effect.fail(
                      makeZerospinError('actor-contract-lineage-unsupported'),
                    );
                  }
                  const payload = yield* decodePayload(contract, { command });
                  const claims = yield* Schema.decodeUnknownEffect(
                    command.automationName == null
                      ? actor.identity.claimsSchema
                      : actor.identity.identitySchema,
                  )(command.claims, {
                    onExcessProperty: 'error',
                  }).pipe(
                    mapParseError({
                      code: 'command-claims-unsupported',
                      prefix:
                        'Saved command identity is unsupported by this aggregate version',
                    }),
                  );

                  const made = yield* makeMutations({
                    claims,
                    contract,
                    models: aggregate.models,
                    command: { ...command, payload },
                  }).pipe(
                    Effect.catch(failure =>
                      encodeFailure(contract, failure).pipe(
                        Effect.flatMap(Effect.fail),
                      ),
                    ),
                    Effect.provideContext(context),
                  );
                  const captured = yield* getReplicatedResources({
                    systemId: key.systemId,
                    mutations: made.mutations,
                    services: aggregate.services,
                    db,
                  }).pipe(
                    Effect.tapError(error =>
                      Effect.sync(() => {
                        if (
                          ![
                            'aggregate-replicated-resource-missing',
                            'replicated-service-resource-not-found',
                          ].includes(error.code)
                        ) {
                          infrastructure.failure = error;
                        }
                      }),
                    ),
                  );
                  const mutations = yield* Effect.forEach(
                    made.mutations,
                    (mutation, mutationIndex) =>
                      Effect.gen(function* () {
                        if (mutation.operationName !== 'replicate') {
                          return yield* encodeMutation({
                            commandId: command.id,
                            mutationIndex,
                            mutation,
                          });
                        }
                        const snapshot = captured.find(
                          entry =>
                            entry.modelName === mutation.model.modelName &&
                            entry.resourceId === mutation.resourceId &&
                            entry.operation.serviceName ===
                              mutation.operation.serviceName,
                        );
                        if (snapshot === undefined) {
                          return yield* Effect.fail(
                            makeZerospinError({
                              code: 'aggregate-command-chain-replicated-resource-missing',
                              message: `Missing prepared resource ${mutation.model.modelName}.${mutation.resourceId}`,
                            }),
                          );
                        }
                        const resource = yield* Schema.decodeUnknownEffect(
                          Schema.toType(EncodedResourceSchema),
                        )(snapshot.operation.resource).pipe(
                          mapParseError({
                            code: 'aggregate-replication-resource-invalid',
                            prefix: 'Invalid captured service resource',
                          }),
                        );
                        const prepared = yield* prepareReplayAppliedMutation({
                          controller: aggregate,
                          mutation: {
                            modelName: resource.modelName,
                            modelVersion: resource.version,
                            resourceId: resource.id,
                            operationName: 'replicate',
                            operation: JSON.stringify({
                              serviceName: snapshot.operation.serviceName,
                              serviceVersion: snapshot.operation.serviceVersion,
                              serviceIndex: snapshot.operation.serviceIndex,
                              resource: {
                                ...resource,
                                deletedAt: resource.deletedAt ?? null,
                              },
                            }),
                          },
                        });
                        if (prepared === null) return null;
                        if (prepared.operationName !== 'replicate') {
                          return yield* Effect.fail(
                            makeZerospinError({
                              code: 'replica-source-mutation-invalid',
                              message:
                                'Replica initialization must produce a replica resource mutation',
                            }),
                          );
                        }
                        return yield* encodeMutation({
                          commandId: command.id,
                          mutationIndex,
                          mutation: {
                            ...prepared,
                            operation: {
                              ...prepared.operation,
                              serviceName: snapshot.operation.serviceName,
                              serviceVersion: snapshot.operation.serviceVersion,
                              serviceIndex: snapshot.operation.serviceIndex,
                            },
                          },
                        });
                      }),
                  );

                  return {
                    mutations: mutations.filter(mutation => mutation !== null),
                    guard: (queryDb: Readonly<Pick<IDb, 'query'>>) =>
                      Effect.gen(function* () {
                        yield* validateAggregateCommand({
                          aggregate,
                          actorName: actor.name,
                          contract,
                          queryDb,
                          payload,
                          claims,
                        });
                      }).pipe(
                        Effect.catch(failure =>
                          isZerospinError(failure) && !('scope' in failure)
                            ? Effect.fail(failure)
                            : encodeFailure(contract, failure).pipe(
                                Effect.flatMap(Effect.fail),
                              ),
                        ),
                        Effect.provideContext(context),
                      ),
                  };
                }).pipe(Effect.result);
                if (
                  Result.isFailure(prepared) &&
                  !('scope' in prepared.failure) &&
                  ![
                    'aggregate-replicated-resource-missing',
                    'replicated-service-resource-not-found',
                    'actor-contract-unsupported',
                    'actor-contract-lineage-unsupported',
                  ].includes(prepared.failure.code)
                ) {
                  return yield* Effect.fail(
                    makeZerospinError(prepared.failure),
                  );
                }
                if (infrastructure.failure !== null) {
                  return yield* Effect.fail(infrastructure.failure);
                }
                return {
                  command,
                  startedAt,
                  mutations: Result.isSuccess(prepared)
                    ? prepared.success.mutations
                    : [],
                  failure: Result.isFailure(prepared)
                    ? yield* Schema.decodeUnknownEffect(PublicFailureSchema)(
                        'cause' in prepared.failure
                          ? yield* encodeError(prepared.failure)
                          : prepared.failure,
                      ).pipe(
                        mapParseError({
                          code: 'command-failure-invalid',
                          prefix: 'Invalid failure',
                        }),
                      )
                    : null,
                  guard: Result.isSuccess(prepared)
                    ? prepared.success.guard
                    : () => Effect.void,
                };
              }),
            ).pipe(Effect.provideContext(context));

            // 3 — commit this command before starting the next program
            yield* executeCommandsTx(db, {
              head,
              preparedPage,
              aggregate,
              key,
            }).pipe(Effect.provideContext(context));
            head = db
              .select()
              .from(aggregateVersionRepoDbConfig.schema.head)
              .where(
                eq(aggregateVersionRepoDbConfig.schema.head.singletonId, 1),
              )
              .get();
          }),
        );
      }
    }),
  );
}, Effect.scoped);
