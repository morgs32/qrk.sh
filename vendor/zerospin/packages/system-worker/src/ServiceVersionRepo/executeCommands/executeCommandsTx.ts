import { applyOperationTx } from '@zerospin/core/contracts/applyOperationTx';
import {
  ServiceTerminalCommandSchema,
  type ServiceChainedCommandSchema,
} from '@zerospin/core/contracts/CommandSchema';
import {
  encodeFailure,
  type IFailure,
} from '@zerospin/core/contracts/failureCodec';
import type { IPreparedContractInput } from '@zerospin/core/contracts/prepareContractInput';
import { runContractGuard } from '@zerospin/core/contracts/runContractGuard';
import type {
  IContract,
  IContractOutput,
} from '@zerospin/core/contracts/types';
import { validateServiceCommand } from '@zerospin/core/contracts/validateServiceCommand';
import { makeTx } from '@zerospin/core/drizzle/make/makeTx';
import type { IResourceDbConfig, ITx } from '@zerospin/core/drizzle/types';
import { withSavepoint } from '@zerospin/core/drizzle/withSavepoint';
import { runProgram } from '@zerospin/core/execution/runProgram';
import type { IAnyModels } from '@zerospin/core/models/types';
import {
  encodeError,
  isZerospinError,
  makeZerospinError,
  mapParseError,
  PublicFailureSchema,
  type IAnyError,
} from '@zerospin/error';
import type config from 'config';
import { eq } from 'drizzle-orm';
import { Effect, Result, Schema } from 'effect';

import { prepareAsyncOperation } from '../../asyncOperations/prepareAsyncOperation.js';
import { forwardCommand } from '../../forwardedCommands.js';
import { encodeOwnedOperation } from '../../ownedOperations.js';
import {
  advanceDispositionHash,
  genesisDispositionHash,
} from '../../serviceDispositionHash/serviceDispositionHash.js';
import { serviceVersionRepoDbConfig } from '../serviceVersionRepoDbConfig.js';

export type IPreparedServiceExecution = Readonly<{
  contract: IContract | null;
  contractVersion: string;
  input: IPreparedContractInput;
  operations: readonly IContractOutput[];
  encodedResult: typeof Schema.Json.Type;
}>;

/** Commit prepared service commands, resource changes, terminal results, and the execution head together. */
export const executeCommandsTx = makeTx('ServiceVersionRepo.executeCommandsTx')(
  function* (
    tx: ITx<
      IResourceDbConfig<IAnyModels, typeof serviceVersionRepoDbConfig.tables>
    >,
    props: {
      cursor: number;
      inputs: readonly {
        command: typeof ServiceChainedCommandSchema.Type;
        prepared: Result.Result<IPreparedServiceExecution, IFailure>;
        startedAt: Date;
      }[];
      service: (typeof config.system.services)[string][string];
      key: {
        systemId: string;
        serviceName: string;
        serviceVersion: string;
      };
    },
  ) {
    const { cursor, inputs, service, key } = props;
    const live = tx
      .select()
      .from(serviceVersionRepoDbConfig.schema.head)
      .where(eq(serviceVersionRepoDbConfig.schema.head.singletonId, 1))
      .get();
    if ((live?.serviceIndex ?? 0) !== cursor) {
      return yield* Effect.fail(
        makeZerospinError({
          code: 'service-execution-head-conflict',
          message: 'Execution head changed while preparing',
        }),
      );
    }
    let dispositionHash = live?.dispositionHash ?? genesisDispositionHash();
    let executedIndex = live?.executedIndex ?? 0;
    for (const { command, prepared, startedAt } of inputs) {
      let guardFailure: IFailure | null = null;
      if (
        command.admission.status === 'succeeded' &&
        Result.isSuccess(prepared)
      ) {
        const contract = prepared.success.contract;
        if (contract !== null) {
          const guarded = yield* validateServiceCommand({
            service,
            caller: command.caller,
            contract,
            db: tx,
            payload: prepared.success.input.payload,
            ...(contract.external === undefined
              ? {}
              : { response: prepared.success.input.response }),
          })
            .pipe(
              Effect.flatMap(() =>
                runContractGuard({
                  contract,
                  db: tx,
                  input: prepared.success.input,
                }),
              ),
            )
            .pipe(
              runProgram,
              Effect.catch(failure =>
                encodeFailure(contract, failure).pipe(
                  Effect.flatMap(Effect.fail),
                ),
              ),
              Effect.result,
            );
          if (Result.isFailure(guarded)) {
            if (!('scope' in guarded.failure)) {
              return yield* Effect.fail(makeZerospinError(guarded.failure));
            }
            guardFailure = yield* Schema.decodeUnknownEffect(
              PublicFailureSchema,
            )(guarded.failure).pipe(
              mapParseError({
                code: 'command-failure-invalid',
                prefix: 'Invalid failure',
              }),
            );
          }
        }
      }
      const applied: Result.Result<void, IFailure | IAnyError> =
        command.admission.status === 'failed'
          ? Result.succeed(undefined)
          : guardFailure !== null
            ? Result.fail(guardFailure)
            : Result.isFailure(prepared)
              ? Result.fail(prepared.failure)
              : yield* withSavepoint({
                  tx,
                  program: Effect.fn('ServiceVersionRepo.execute.command')(
                    function* ({ tx: commandTx }) {
                      for (const [
                        operationIndex,
                        operation,
                      ] of prepared.success.operations.entries()) {
                        if (operation.operationName === 'async') {
                          const original =
                            command.serviceVersion === key.serviceVersion;
                          const encoded = yield* prepareAsyncOperation({
                            operation,
                            commandId: command.id,
                            operationIndex,
                            committedAt: startedAt,
                            original,
                            actor:
                              command.caller === null
                                ? undefined
                                : service.actors[command.caller.actorName],
                            claims: command.caller?.claims ?? null,
                          });
                          commandTx
                            .insert(
                              serviceVersionRepoDbConfig.schema.asyncOperations,
                            )
                            .values({
                              ...encoded,
                              serviceIndex: command.serviceIndex,
                            })
                            .run();
                          continue;
                        }
                        if (
                          service.models[operation.model.modelName] !==
                          operation.model
                        ) {
                          return yield* makeZerospinError(
                            'service-operation-out-of-scope',
                          );
                        }
                        yield* applyOperationTx({
                          tx: commandTx,
                          operation,
                          commandId: command.id,
                          operationIndex,
                          appliedAt: startedAt,
                        });
                        const encoded = yield* encodeOwnedOperation({
                          output: operation,
                          commandId: command.id,
                          operationIndex,
                        });
                        const bytes =
                          yield* serviceVersionRepoDbConfig.tables.modelOperations
                            .encodeRow({
                              ...encoded,

                              serviceIndex: command.serviceIndex,
                              committedAt: startedAt,
                            })
                            .pipe(
                              mapParseError({
                                code: 'operation-row-encode-failed',
                                prefix: 'Invalid retained owned operation',
                              }),
                            );
                        commandTx
                          .insert(
                            serviceVersionRepoDbConfig.schema.modelOperations,
                          )
                          .values(bytes)
                          .run();
                      }
                    },
                  ),
                }).pipe(Effect.result);
      if (
        Result.isFailure(applied) &&
        applied.failure !== guardFailure &&
        !(Result.isFailure(prepared) && applied.failure === prepared.failure) &&
        ![
          'operation-row-not-found',
          'operation-referential-integrity-failed',
        ].includes(isZerospinError(applied.failure) ? applied.failure.code : '')
      ) {
        return yield* Effect.fail(
          isZerospinError(applied.failure)
            ? applied.failure
            : makeZerospinError('unexpected-business-failure'),
        );
      }
      // Settle the command outcome after operation application or savepoint rollback.
      const executionFailure = Result.isFailure(applied)
        ? yield* Schema.decodeUnknownEffect(PublicFailureSchema)(
            'cause' in applied.failure
              ? yield* encodeError(applied.failure)
              : applied.failure,
          ).pipe(
            mapParseError({
              code: 'command-failure-invalid',
              prefix: 'Invalid failure',
            }),
          )
        : null;
      dispositionHash = advanceDispositionHash({
        failure:
          command.admission.status === 'failed'
            ? command.admission.failure
            : executionFailure,
        previousDispositionHash: dispositionHash,
        serviceIndex: command.serviceIndex,
        commandId: command.id,
        disposition:
          command.admission.status === 'failed' || Result.isFailure(applied)
            ? 'failure'
            : 'success',
      });
      // Retain the terminal outcome alongside retained owned operations.
      const terminal = yield* Schema.decodeUnknownEffect(
        Schema.toType(ServiceTerminalCommandSchema),
      )({
        ...command,
        dispositionHash,
        execution:
          command.admission.status === 'failed'
            ? { status: 'skipped', reason: 'admission-failed' }
            : executionFailure === null
              ? {
                  status: 'succeeded',
                  contractVersion: Result.isSuccess(prepared)
                    ? prepared.success.contractVersion
                    : command.contractVersion,
                  result: Result.isSuccess(prepared)
                    ? prepared.success.encodedResult
                    : null,
                  startedAt,
                  completedAt: new Date(),
                }
              : {
                  status: 'failed',
                  startedAt,
                  completedAt: new Date(),
                  failure: executionFailure,
                },
      }).pipe(
        mapParseError({
          code: 'service-terminal-command-invalid',
          prefix: `Failed to create service result ${command.serviceIndex}`,
        }),
      );
      const bytes = yield* serviceVersionRepoDbConfig.tables.commands
        .encodeRow({
          ...terminal,
          response: terminal.response ?? null,
          executedIndex: ++executedIndex,
          executionVersion: key.serviceVersion,
        })
        .pipe(
          mapParseError({
            code: 'service-result-encode-failed',
            prefix: 'Invalid service executed command',
          }),
        );
      tx.insert(serviceVersionRepoDbConfig.schema.commands).values(bytes).run();
      tx.insert(serviceVersionRepoDbConfig.schema.executedCommandOutbox)
        .values({
          executedIndex,
          serviceIndex: command.serviceIndex,
          ...forwardCommand(bytes),
          lastDeliveryFailure: null,
        })
        .run();
      tx.insert(serviceVersionRepoDbConfig.schema.head)
        .values({
          singletonId: 1,
          serviceIndex: command.serviceIndex,
          executedIndex,
          dispositionHash,
        })
        .onConflictDoUpdate({
          target: serviceVersionRepoDbConfig.schema.head.singletonId,
          set: {
            serviceIndex: command.serviceIndex,
            executedIndex,
            dispositionHash,
          },
        })
        .run();
    }
  },
);
