import { resolveAggregateActorVersion } from '@zerospin/core/aggregateActor/getAggregateActorVersion';
import {
  AggregateChainedCommandSchema,
  EncodedAggregateCommandSchema,
} from '@zerospin/core/contracts/CommandSchema';
import { decodePayload } from '@zerospin/core/contracts/decodePayload/decodePayload';
import { validateExternalResponse } from '@zerospin/core/contracts/externalResponseCodec';
import { encodeFailure } from '@zerospin/core/contracts/failureCodec';
import { makeOperations } from '@zerospin/core/contracts/make/makeOperations';
import { prepareContractInput } from '@zerospin/core/contracts/prepareContractInput';
import { runContractGuard } from '@zerospin/core/contracts/runContractGuard';
import type { IContract } from '@zerospin/core/contracts/types';
import { validateAggregateCommand } from '@zerospin/core/contracts/validateAggregateCommand';
import type { IDb } from '@zerospin/core/drizzle/types';
import { getByKeyOrThrow } from '@zerospin/core/utils/getByKeyOrThrow';
import {
  encodeError,
  isZerospinError,
  makeZerospinError,
  mapParseError,
  PublicFailureSchema,
} from '@zerospin/error';
import config from 'config';
import { eq } from 'drizzle-orm';
import { Effect, Result, Schema, type Context, type Semaphore } from 'effect';

import { aggregateChainDbConfig } from '../../AggregateChain/aggregateChainDbConfig.js';
import { encodeOwnedOperation } from '../../ownedOperations.js';
import { aggregateVersionRepoDbConfig } from '../aggregateVersionRepoDbConfig.js';

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
  if (props.commands.length === 0) {
    return;
  }
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
      if (tail.length === 0) {
        return;
      }
      const context: Context.Context<unknown> =
        yield* system.runtime.contextEffect;
      // 2 — adapt one payload, run its synchronous program, prepare owned operations
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
                    operations: [],
                    originalExecutionVersion: row.originalExecutionVersion,
                    encodedResult: null,
                    contractVersion: command.contractVersion,
                    failure: null,
                    guard: () => Effect.void,
                    contract: null,
                    payload: null,
                  };
                }
                const prepared = yield* Effect.gen(function* () {
                  const actor = yield* resolveAggregateActorVersion(
                    latestAggregate,
                    command,
                  );
                  const sourceContract = yield* getByKeyOrThrow({
                    record: actor.contracts,
                    key: command.commandName,
                    recordKind: 'actor-contract',
                  });
                  const targetActor = aggregate.actors[actor.name];
                  const contract =
                    targetActor === undefined || targetActor === null
                      ? undefined
                      : targetActor.contracts[command.commandName];
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
                  if (
                    ancestor === undefined &&
                    (contract.external === undefined ||
                      sourceContract.external === undefined)
                  ) {
                    return yield* Effect.fail(
                      makeZerospinError('actor-contract-lineage-unsupported'),
                    );
                  }
                  let encodedAsyncPayload: unknown;
                  if (sourceContract.external !== undefined) {
                    if (command.response === undefined) {
                      return yield* makeZerospinError(
                        'external-response-required',
                      );
                    }
                    if (
                      sourceContract.version !== command.contractVersion ||
                      contract.external === undefined
                    ) {
                      return yield* makeZerospinError(
                        'external-contract-kind-mismatch',
                      );
                    }
                    encodedAsyncPayload = yield* Schema.decodeUnknownEffect(
                      Schema.fromJsonString(Schema.Json),
                    )(command.payload).pipe(
                      mapParseError({
                        code: 'external-payload-json-invalid',
                        prefix: 'Invalid frozen input',
                      }),
                    );
                    yield* validateExternalResponse(
                      sourceContract,
                      encodedAsyncPayload,
                      command.response,
                    );
                  } else if (contract.external !== undefined) {
                    return yield* makeZerospinError(
                      'external-contract-kind-mismatch',
                    );
                  }
                  const decodedPayload =
                    sourceContract.external === undefined
                      ? yield* decodePayload(contract, { command })
                      : encodedAsyncPayload;
                  const claims = yield* Schema.decodeUnknownEffect(
                    actor.identity.claimsSchema,
                  )(command.claims, {
                    onExcessProperty: 'error',
                  }).pipe(
                    mapParseError({
                      code: 'command-claims-unsupported',
                      prefix:
                        'Saved command identity is unsupported by this aggregate version',
                    }),
                  );
                  const input = yield* prepareContractInput({
                    contract,
                    command: { ...command, payload: decodedPayload },
                    claims,
                  });
                  const { payload } = input;
                  // Owner access checks still apply to an exact business repeat.
                  yield* validateAggregateCommand({
                    aggregate,
                    actorName: actor.name,
                    contract,
                    db,
                    payload,
                    claims,
                    ...(contract.external === undefined
                      ? {}
                      : { response: input.response }),
                  }).pipe(
                    Effect.catch(failure =>
                      encodeFailure(contract, failure).pipe(
                        Effect.flatMap(Effect.fail),
                      ),
                    ),
                  );
                  const made = yield* makeOperations({
                    db,
                    contract,
                    models: aggregate.models,
                    command,
                    input,
                  }).pipe(
                    Effect.catch(failure =>
                      encodeFailure(contract, failure).pipe(
                        Effect.flatMap(Effect.fail),
                      ),
                    ),
                    Effect.provideContext(context),
                  );
                  return {
                    encodedResult: made.encodedResult,
                    contractVersion: made.contractVersion,
                    operations: yield* Effect.forEach(
                      made.operations,
                      (operation, operationIndex) =>
                        Effect.gen(function* () {
                          if (operation.operationName === 'async') {
                            return {
                              ...operation,
                              commandId: command.id,
                              operationIndex,
                            };
                          }
                          return yield* encodeOwnedOperation({
                            output: operation,
                            commandId: command.id,
                            operationIndex,
                          });
                        }),
                    ),
                    contract,
                    payload,
                    guard: (db: Readonly<Pick<IDb, 'query'>>) =>
                      Effect.gen(function* () {
                        yield* validateAggregateCommand({
                          aggregate,
                          actorName: actor.name,
                          contract,
                          db,
                          payload,
                          claims,
                          ...(contract.external === undefined
                            ? {}
                            : { response: input.response }),
                        });
                        return yield* runContractGuard({ contract, db, input });
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
                    'contract-program-result-invalid',
                    'contract-result-encode-failed',
                    'contract-result-encoding-invalid',
                    'program-must-be-synchronous',
                    'contract-guard-result-invalid',
                    'actor-contract-unsupported',
                    'actor-contract-lineage-unsupported',
                  ].includes(prepared.failure.code)
                ) {
                  return yield* Effect.fail(
                    makeZerospinError(prepared.failure),
                  );
                }
                return {
                  command,
                  startedAt,
                  originalExecutionVersion: row.originalExecutionVersion,
                  operations: Result.isSuccess(prepared)
                    ? prepared.success.operations
                    : [],
                  encodedResult: Result.isSuccess(prepared)
                    ? prepared.success.encodedResult
                    : null,
                  contractVersion: Result.isSuccess(prepared)
                    ? prepared.success.contractVersion
                    : command.contractVersion,
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
                  contract: Result.isSuccess(prepared)
                    ? prepared.success.contract
                    : null,
                  payload: Result.isSuccess(prepared)
                    ? prepared.success.payload
                    : null,
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
