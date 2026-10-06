import {
  EncodedServiceCommandSchema,
  ServiceChainedCommandSchema,
} from '@zerospin/core/contracts/CommandSchema';
import { decodePayload } from '@zerospin/core/contracts/decodePayload/decodePayload';
import { validateExternalResponse } from '@zerospin/core/contracts/externalResponseCodec';
import {
  encodeFailure,
  type IFailure,
} from '@zerospin/core/contracts/failureCodec';
import { makeOperations } from '@zerospin/core/contracts/make/makeOperations';
import { prepareContractInput } from '@zerospin/core/contracts/prepareContractInput';
import { validateServiceCommand } from '@zerospin/core/contracts/validateServiceCommand';
import type { IDb } from '@zerospin/core/drizzle/types';
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
import { Effect, Result, Schema, type Context } from 'effect';

import { serviceChainDbConfig } from '../../ServiceChain/serviceChainDbConfig.js';
import { serviceVersionRepoDbConfig } from '../serviceVersionRepoDbConfig.js';

import {
  executeCommandsTx,
  type IPreparedServiceExecution,
} from './executeCommandsTx.js';
const { system } = config;
/** Caller holds the execution permit; prepare before atomically committing the new suffix. */
export const executeCommands = Effect.fn('ServiceVersionRepo.executeCommands')(
  function* (props: {
    db: IDb;
    key: {
      systemId: string;
      serviceName: string;
      serviceVersion: string;
    };
    rows: readonly (typeof serviceChainDbConfig.schema.commands.$inferSelect)[];
  }) {
    const { db, key, rows: inputRows } = props;
    const head = db
      .select()
      .from(serviceVersionRepoDbConfig.schema.head)
      .where(eq(serviceVersionRepoDbConfig.schema.head.singletonId, 1))
      .get();
    let cursor = head?.serviceIndex ?? 0;
    for (const row of inputRows) {
      if (!Number.isSafeInteger(row.serviceIndex) || row.serviceIndex < 1) {
        return yield* Effect.fail(
          makeZerospinError({
            code: 'service-execution-gap',
            message:
              'Admitted service page requires positive contiguous indices',
          }),
        );
      }
    }
    const rows = inputRows.filter(row => row.serviceIndex > cursor);
    if (rows.length === 0) {
      return;
    }
    const latestService = yield* getByKeyOrThrow({
      record: system.services,
      key: key.serviceName,
      recordKind: 'services',
    });
    const service = yield* getByKeyOrThrow({
      record: latestService,
      key: key.serviceVersion,
      recordKind: 'listed versions',
    });
    const context: Context.Context<unknown> =
      yield* system.runtime.contextEffect;
    for (const row of rows) {
      const inputs = yield* Effect.forEach([row], row =>
        Effect.gen(function* () {
          if (row.serviceIndex !== cursor + 1) {
            return yield* Effect.fail(
              makeZerospinError({
                code: 'service-execution-gap',
                message: 'Admitted service page is not contiguous',
              }),
            );
          }
          const startedAt = new Date();
          const decoded = yield* serviceChainDbConfig.tables.commands
            .decodeRow(row)
            .pipe(
              mapParseError({
                code: 'command-row-invalid',
                prefix: 'Invalid command row',
              }),
            );
          const source = yield* Schema.decodeUnknownEffect(
            EncodedServiceCommandSchema,
          )(decoded).pipe(
            mapParseError({
              code: 'service-input-invalid',
              prefix: 'Invalid admitted service input',
            }),
          );
          if (source.serviceName !== key.serviceName) {
            return yield* Effect.fail(
              makeZerospinError({
                code: 'service-input-target-mismatch',
                message: 'Admitted service input differs from its row',
              }),
            );
          }
          const command = yield* Schema.decodeUnknownEffect(
            Schema.toType(ServiceChainedCommandSchema),
          )({
            ...source,
            serviceIndex: row.serviceIndex,
            admission: decoded.admission,
            execution: { status: 'pending' as const },
            dispositionHash: null,
          }).pipe(
            mapParseError({
              code: 'service-input-invalid',
              prefix: 'Invalid admitted service command',
            }),
          );
          const prepared: Result.Result<
            IPreparedServiceExecution,
            IFailure | IAnyError
          > =
            command.admission.status === 'failed'
              ? Result.succeed({
                  contract: null,
                  input: { payload: undefined, claims: null },
                  operations: [],
                  encodedResult: null,
                  contractVersion: command.contractVersion,
                })
              : yield* Effect.gen(function* () {
                  const producer =
                    latestService[source.serviceVersion]?.actors[
                      command.caller?.actorName ?? ''
                    ];
                  const producingContract =
                    producer?.contracts[source.commandName];
                  const contract =
                    producingContract?.external !== undefined &&
                    command.caller !== null
                      ? service.actors[command.caller.actorName]?.contracts[
                          source.commandName
                        ]
                      : Object.values(service.contracts).find(
                          candidate =>
                            candidate.commandName === source.commandName,
                        );
                  if (!contract) {
                    return yield* Effect.fail(
                      makeZerospinError({
                        code: 'service-contract-not-found',
                        message: `Missing service contract ${source.commandName}`,
                      }),
                    );
                  }
                  let encodedAsyncPayload: unknown;
                  if (producingContract?.external !== undefined) {
                    if (command.response === undefined) {
                      return yield* makeZerospinError(
                        'external-response-required',
                      );
                    }
                    if (
                      producer?.version !== command.caller?.actorVersion ||
                      producingContract?.version !== source.contractVersion ||
                      contract.external === undefined
                    ) {
                      return yield* makeZerospinError(
                        'external-contract-kind-mismatch',
                      );
                    }
                    encodedAsyncPayload = yield* Schema.decodeUnknownEffect(
                      Schema.fromJsonString(Schema.Json),
                    )(source.payload).pipe(
                      mapParseError({
                        code: 'external-payload-json-invalid',
                        prefix: 'Invalid frozen input',
                      }),
                    );
                    yield* validateExternalResponse(
                      producingContract,
                      encodedAsyncPayload,
                      command.response,
                    );
                  } else if (contract.external !== undefined) {
                    return yield* makeZerospinError(
                      'external-contract-kind-mismatch',
                    );
                  }
                  const decodedPayload =
                    producingContract?.external === undefined
                      ? yield* decodePayload(contract, { command: source })
                      : encodedAsyncPayload;
                  const input = yield* prepareContractInput({
                    contract,
                    command: { ...command, payload: decodedPayload },
                    claims: command.caller?.claims ?? null,
                  });
                  const { payload } = input;
                  yield* validateServiceCommand({
                    service,
                    caller: command.caller,
                    contract,
                    db,
                    payload,
                    ...(contract.external === undefined
                      ? {}
                      : { response: input.response }),
                  });
                  const made = yield* makeOperations({
                    db,
                    contract,
                    models: service.models,
                    command: source,
                    input,
                  }).pipe(
                    Effect.catch(failure =>
                      encodeFailure(contract, failure).pipe(
                        Effect.flatMap(Effect.fail),
                      ),
                    ),
                  );
                  return { ...made, input, contract };
                }).pipe(Effect.result);
          const unsupportedVersion =
            Result.isFailure(prepared) &&
            isZerospinError(prepared.failure) &&
            prepared.failure.code === 'contract-payload-version-unsupported';
          if (
            Result.isFailure(prepared) &&
            !('scope' in prepared.failure) &&
            !unsupportedVersion &&
            ![
              'contract-program-result-invalid',
              'contract-result-encode-failed',
              'contract-result-encoding-invalid',
              'program-must-be-synchronous',
              'contract-guard-result-invalid',
            ].includes(prepared.failure.code)
          ) {
            return yield* Effect.fail(
              makeZerospinError({
                code: prepared.failure.code,
                message: prepared.failure.message,
                extra: prepared.failure.extra,
              }),
            );
          }
          const checked = Result.isFailure(prepared)
            ? Result.fail(
                yield* Schema.decodeUnknownEffect(PublicFailureSchema)(
                  unsupportedVersion
                    ? yield* encodeError(prepared.failure)
                    : prepared.failure,
                ).pipe(
                  mapParseError({
                    code: 'command-failure-invalid',
                    prefix: 'Invalid failure',
                  }),
                ),
              )
            : Result.succeed(prepared.success);
          return {
            command,
            prepared: checked,
            startedAt,
          };
        }),
      ).pipe(Effect.provideContext(context));
      yield* executeCommandsTx(db, { cursor, inputs, service, key }).pipe(
        Effect.provideContext(context),
      );
      cursor = row.serviceIndex;
    }
  },
  Effect.scoped,
);
