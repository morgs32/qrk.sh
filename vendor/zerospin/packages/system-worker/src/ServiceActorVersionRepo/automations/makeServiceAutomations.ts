import type { Async } from '@zerospin/core/async/Async';
import { applyAggregateMutationTx } from '@zerospin/core/contracts/applyAggregateMutationTx';
import { EncodedServiceCommandSchema } from '@zerospin/core/contracts/CommandSchema';
import { decodePayload } from '@zerospin/core/contracts/decodePayload/decodePayload';
import { encodeMutation } from '@zerospin/core/contracts/encodeAppliedMutation';
import { encodePayload } from '@zerospin/core/contracts/encodePayload';
import { encodeBusinessFailure } from '@zerospin/core/contracts/failureCodec';
import { makeMutations } from '@zerospin/core/contracts/make/makeMutations';
import { prepareReplayAppliedMutation } from '@zerospin/core/contracts/prepareReplayAppliedMutation';
import { runContractGuard } from '@zerospin/core/contracts/runContractGuard';
import { makeResourceDbConfig } from '@zerospin/core/drizzle/make/makeDbConfig/makeDbConfig';
import { makeTx } from '@zerospin/core/drizzle/make/makeTx';
import type { IDb } from '@zerospin/core/drizzle/types';
import {
  encodeError,
  makeZerospinError,
  type IAnyError,
} from '@zerospin/error';
import config from 'config';
import { and, eq } from 'drizzle-orm';
import { Effect, Result, Schema } from 'effect';

import { makeOptimisticActorDb } from '../../AggregateActorVersionRepo/optimistic/makeOptimisticActorDb.js';
import { makeActorSnapshotDb } from '../../AggregateActorVersionRepo/validateCommands/makeActorSnapshotDb.js';
import { readServiceResources } from '../readServiceResources.js';
import { serviceActorVersionRepoDbConfig } from '../serviceActorVersionRepoDbConfig.js';

/** Persist each invocation outcome before exposing its output to service admission. */
export const makeServiceAutomations = (props: {
  db: IDb;
  key: {
    systemId: string;
    serviceName: string;
    serviceVersion: string;
    actorName: string;
    actorVersion: string;
    actorPath: string;
  };
  stageOutputs: (serviceIndex: number) => Effect.Effect<void, IAnyError, Async>;
}) => {
  const { db, key } = props;
  const service = config.system.services[key.serviceName]?.[key.serviceVersion];
  if (service === undefined) {
    throw makeZerospinError('automation-service-unsupported');
  }
  const tables = serviceActorVersionRepoDbConfig.schema;

  const readPending = Effect.fn('ServiceAutomations.readPending')(function* () {
    return yield* Effect.forEach(
      db
        .select()
        .from(tables.pendingCommands)
        .orderBy(tables.pendingCommands.stageIndex)
        .all(),
      row =>
        Effect.gen(function* () {
          const commandRowId = yield* Schema.decodeUnknownEffect(
            Schema.TemplateLiteral(['row_', Schema.String]),
          )(row.commandRowId);
          const command = db
            .select()
            .from(tables.commands)
            .where(eq(tables.commands.rowId, commandRowId))
            .get();
          if (command === undefined) {
            return yield* makeZerospinError('service-pending-command-missing');
          }
          return {
            row,
            command,
            decoded:
              yield* serviceActorVersionRepoDbConfig.tables.pendingCommands.decodeRow(
                row,
              ),
          };
        }),
    );
  });

  const run = Effect.fn('ServiceAutomations.run')(function* (
    serviceIndex: number,
  ) {
    const group = db
      .select()
      .from(tables.automationGroups)
      .where(eq(tables.automationGroups.serviceIndex, serviceIndex))
      .get();
    if (group?.status !== 'open') return;
    const runs = db
      .select()
      .from(tables.automationRuns)
      .where(eq(tables.automationRuns.serviceIndex, serviceIndex))
      .orderBy(tables.automationRuns.automationName)
      .all();
    const pendingRuns = runs.filter(
      invocation => invocation.programStatus === 'pending',
    );
    const selected =
      pendingRuns.length === 0
        ? []
        : yield* Effect.gen(function* () {
            const pending = yield* readPending();
            const optimistic = yield* makeOptimisticActorDb({
              authoritativeDb: db,
              models: service.models,
              pending: pending
                .filter(entry => entry.row.resolvedAt === null)
                .map(entry => ({
                  commandId: entry.command.id,
                  appliedAt: entry.decoded.stagedAt,
                  mutations: entry.decoded.mutations,
                })),
            });
            return yield* readServiceResources(optimistic.db, service, key);
          }).pipe(Effect.scoped);
    for (const invocation of pendingRuns) {
      db.update(tables.automationRuns)
        .set({ programStatus: 'started' })
        .where(
          and(
            eq(tables.automationRuns.serviceIndex, serviceIndex),
            eq(tables.automationRuns.automationName, invocation.automationName),
            eq(tables.automationRuns.programStatus, 'pending'),
          ),
        )
        .run();
    }
    yield* Effect.forEach(
      pendingRuns,
      invocation =>
        Effect.gen(function* () {
          const automation = service.automations[invocation.automationName];
          if (automation === undefined) {
            return yield* makeZerospinError('automation-not-found');
          }
          const source = db
            .select()
            .from(tables.commands)
            .where(eq(tables.commands.serviceIndex, serviceIndex))
            .get();
          if (source === undefined) {
            return yield* makeZerospinError('automation-trigger-not-found');
          }
          const result = yield* Effect.gen(function* () {
            const scratch = yield* makeActorSnapshotDb(
              makeResourceDbConfig({ models: service.models }),
            );
            for (const resource of selected) {
              const model = service.models[resource.modelName];
              if (model !== undefined) {
                scratch.db.insert(model.drizzleSchema).values(resource).run();
              }
            }
            const payload = yield* decodePayload(automation.on, {
              command: source,
            });
            const context = yield* config.system.runtime.contextEffect;
            const output = yield* Effect.suspend(() =>
              automation.program({
                db: scratch.db,
                on: {
                  id: source.id,
                  commandName: source.commandName,
                  contractVersion: automation.on.version,
                  payload,
                  serviceName: source.serviceName,
                  serviceVersion: source.serviceVersion,
                },
                contracts: Object.fromEntries(
                  Object.entries(automation.contracts).map(
                    ([name, contract]) => [
                      name,
                      (payload: Record<string, unknown>) => ({
                        contract,
                        payload,
                      }),
                    ],
                  ),
                ),
              }),
            ).pipe(
              Effect.provideContext(context),
              Effect.catchDefect(defect =>
                Effect.fail(
                  makeZerospinError({
                    code: 'automation-program-defect',
                    cause: String(defect),
                  }),
                ),
              ),
            );
            if (output === null) return null;
            if (
              !Object.values(automation.contracts).includes(output.contract)
            ) {
              return yield* makeZerospinError(
                'automation-output-contract-forbidden',
              );
            }
            const bytes = new TextEncoder().encode(
              JSON.stringify([
                key.systemId,
                key.serviceName,
                key.serviceVersion,
                automation.name,
                source.id,
              ]),
            );
            return {
              id: `cmd_${Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')}`,
              commandName: output.contract.commandName,
              contractVersion: output.contract.version,
              payload: yield* encodePayload(output.contract, {
                version: output.contract.version,
                payload: output.payload,
              }),
              serviceName: key.serviceName,
              serviceVersion: key.serviceVersion,
              automationName: automation.name,
            };
          }).pipe(Effect.scoped, Effect.result);
          if (Result.isFailure(result)) {
            const failure = yield* encodeError(
              makeZerospinError(result.failure),
            );
            const encoded =
              yield* serviceActorVersionRepoDbConfig.tables.automationRuns.encodeRow(
                {
                  serviceIndex,
                  automationName: invocation.automationName,
                  programStatus: 'failed',
                  programFailure: failure,
                  stagingFailure: null,
                  outputCommandRowId: null,
                },
              );
            db.update(tables.automationRuns)
              .set({
                programStatus: encoded.programStatus,
                programFailure: encoded.programFailure,
              })
              .where(
                and(
                  eq(tables.automationRuns.serviceIndex, serviceIndex),
                  eq(
                    tables.automationRuns.automationName,
                    invocation.automationName,
                  ),
                  eq(tables.automationRuns.programStatus, 'started'),
                ),
              )
              .run();
            return;
          }
          yield* makeTx('ServiceAutomations.saveOutput')(function* (tx) {
            const current = tx
              .select()
              .from(tables.automationRuns)
              .where(
                and(
                  eq(tables.automationRuns.serviceIndex, serviceIndex),
                  eq(
                    tables.automationRuns.automationName,
                    invocation.automationName,
                  ),
                ),
              )
              .get();
            if (current?.programStatus !== 'started') return;
            let outputCommandRowId: `row_${string}` | null = null;
            if (result.success !== null) {
              outputCommandRowId = `row_${crypto.randomUUID()}`;
              tx.insert(tables.commands)
                .values(
                  yield* serviceActorVersionRepoDbConfig.tables.commands.encodeRow(
                    {
                      rowId: outputCommandRowId,
                      ...result.success,
                      serviceIndex: null,
                      admission: null,
                      execution: null,
                      dispositionHash: null,
                      actorServiceIndex: null,
                      serviceHash: null,
                      actorDelta: null,
                      acknowledgedAt: null,
                      lastDeliveryFailure: null,
                    },
                  ),
                )
                .run();
            }
            tx.update(tables.automationRuns)
              .set({
                programStatus: result.success === null ? 'empty' : 'succeeded',
                outputCommandRowId,
              })
              .where(
                and(
                  eq(tables.automationRuns.serviceIndex, serviceIndex),
                  eq(
                    tables.automationRuns.automationName,
                    invocation.automationName,
                  ),
                  eq(tables.automationRuns.programStatus, 'started'),
                ),
              )
              .run();
          })(db);
        }),
      { concurrency: 'unbounded' },
    );
    yield* props.stageOutputs(serviceIndex);
  });

  const stage = Effect.fn('ServiceAutomations.stage')(function* (
    serviceIndex: number,
  ) {
    const pending = yield* readPending();
    const scratch = yield* makeOptimisticActorDb({
      authoritativeDb: db,
      models: service.models,
      pending: pending
        .filter(entry => entry.row.resolvedAt === null)
        .map(entry => ({
          commandId: entry.command.id,
          appliedAt: entry.decoded.stagedAt,
          mutations: entry.decoded.mutations,
        })),
    });
    const context = yield* config.system.runtime.contextEffect;
    const runs = db
      .select()
      .from(tables.automationRuns)
      .where(eq(tables.automationRuns.serviceIndex, serviceIndex))
      .all();
    let stageIndex = pending.at(-1)?.row.stageIndex ?? 0;
    for (const invocation of runs) {
      if (
        invocation.programStatus !== 'succeeded' ||
        invocation.stagingFailure !== null ||
        invocation.outputCommandRowId === null
      ) {
        continue;
      }
      if (
        pending.some(
          entry => entry.row.commandRowId === invocation.outputCommandRowId,
        )
      ) {
        continue;
      }
      const output = db
        .select()
        .from(tables.commands)
        .where(eq(tables.commands.rowId, invocation.outputCommandRowId))
        .get();
      if (output === undefined) {
        return yield* makeZerospinError('automation-output-not-found');
      }
      const contract = service.contracts[output.commandName];
      if (
        contract === undefined ||
        contract.version !== output.contractVersion
      ) {
        return yield* makeZerospinError(
          'automation-output-contract-unsupported',
        );
      }
      const prepared = yield* Effect.gen(function* () {
        const encodedCommand = yield* Schema.decodeUnknownEffect(
          EncodedServiceCommandSchema,
        )({
          id: output.id,
          commandName: output.commandName,
          contractVersion: output.contractVersion,
          payload: output.payload,
          serviceName: output.serviceName,
          serviceVersion: output.serviceVersion,
        });
        const payload = yield* decodePayload(contract, {
          command: encodedCommand,
        });
        yield* runContractGuard({
          contract,
          queryDb: scratch.db,
          payload,
          claims: null,
        });
        const made = yield* makeMutations({
          contract,
          models: service.models,
          command: { ...encodedCommand, payload },
          claims: null,
        });
        const mutations = yield* Effect.forEach(
          made.mutations,
          (mutation, mutationIndex) =>
            encodeMutation({ commandId: output.id, mutationIndex, mutation }),
        );
        const stagedAt = new Date();
        yield* makeTx('ServiceAutomations.preview')(function* (tx) {
          for (const encoded of mutations) {
            const mutation = yield* prepareReplayAppliedMutation({
              mutation: encoded,
              controller: service,
            });
            yield* applyAggregateMutationTx({
              tx,
              mutation,
              commandId: output.id,
              mutationIndex: encoded.mutationIndex,
              appliedAt: stagedAt,
            });
          }
        })(scratch.db);
        return { mutations, stagedAt };
      }).pipe(Effect.provideContext(context), Effect.result);
      if (Result.isFailure(prepared)) {
        const failure = yield* encodeBusinessFailure(
          contract,
          prepared.failure,
        );
        const encoded =
          yield* serviceActorVersionRepoDbConfig.tables.automationRuns.encodeRow(
            {
              serviceIndex,
              automationName: invocation.automationName,
              programStatus: invocation.programStatus,
              outputCommandRowId: invocation.outputCommandRowId,
              programFailure: null,
              stagingFailure: failure,
            },
          );
        db.update(tables.automationRuns)
          .set({ stagingFailure: encoded.stagingFailure })
          .where(
            and(
              eq(tables.automationRuns.serviceIndex, serviceIndex),
              eq(
                tables.automationRuns.automationName,
                invocation.automationName,
              ),
            ),
          )
          .run();
        continue;
      }
      stageIndex += 1;
      const outputCommandRowId = invocation.outputCommandRowId;
      yield* makeTx('ServiceAutomations.stageTx')(function* (tx) {
        tx.insert(tables.pendingCommands)
          .values(
            yield* serviceActorVersionRepoDbConfig.tables.pendingCommands.encodeRow(
              {
                stageIndex,
                commandRowId: outputCommandRowId,
                stagedAt: prepared.success.stagedAt,
                mutations: prepared.success.mutations,
                resolvedAt: null,
                acknowledgedAt: null,
                lastDeliveryFailure: null,
              },
            ),
          )
          .run();
      })(db);
    }
    db.update(tables.automationGroups)
      .set({ status: 'staged' })
      .where(eq(tables.automationGroups.serviceIndex, serviceIndex))
      .run();
  });

  const resume = Effect.fn('ServiceAutomations.resume')(function* () {
    const open = db
      .select()
      .from(tables.automationGroups)
      .where(eq(tables.automationGroups.status, 'open'))
      .orderBy(tables.automationGroups.serviceIndex)
      .all();
    for (const group of open) {
      const started = db
        .select()
        .from(tables.automationRuns)
        .where(
          and(
            eq(tables.automationRuns.serviceIndex, group.serviceIndex),
            eq(tables.automationRuns.programStatus, 'started'),
          ),
        )
        .all();
      for (const invocation of started) {
        db.update(tables.automationRuns)
          .set({ programStatus: 'interrupted' })
          .where(
            and(
              eq(tables.automationRuns.serviceIndex, group.serviceIndex),
              eq(
                tables.automationRuns.automationName,
                invocation.automationName,
              ),
            ),
          )
          .run();
      }
      yield* run(group.serviceIndex);
    }
  });

  return { run, stage, resume };
};
