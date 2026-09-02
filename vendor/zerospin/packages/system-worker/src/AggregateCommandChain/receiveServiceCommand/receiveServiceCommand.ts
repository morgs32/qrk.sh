import { makeAsync } from '@zerospin/core/async/makeAsync';
import {
  EncodedServiceCommandSchema,
  ServiceChainedCommandSchema,
} from '@zerospin/core/contracts/CommandSchema';
import type { IDb } from '@zerospin/core/drizzle/types';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import {
  mapParseError,
  ZerospinError,
  type IAnyError,
  type IAnyErrorJson,
  type IEncodedResult,
} from '@zerospin/error';
import { and, desc, eq } from 'drizzle-orm';
import { Effect, Schema } from 'effect';
import type { Semaphore } from 'effect/Semaphore';

import { ServiceCommandChain } from '../../ServiceCommandChain/ServiceCommandChain.js';
import { aggregateCommandChainDrizzleSchemas } from '../AggregateCommandChainDbConfig.js';

export const receiveServiceCommand = Effect.fn(
  'AggregateCommandChain.receiveServiceCommand',
)(function* (props: {
  admissionSemaphore: Semaphore;
  command: Schema.Schema.Type<typeof ServiceChainedCommandSchema>;
  db: IDb;
  materializedAggregateRepos: Readonly<{
    getByName(name: string): Readonly<{
      isServiceCommandRelevant(props: {
        command: Schema.Schema.Type<typeof ServiceChainedCommandSchema>;
      }): PromiseLike<IEncodedResult<boolean, IAnyErrorJson>>;
    }>;
  }>;
  serviceCommandChains: Readonly<{
    getByName(name: string): Readonly<{
      getCommands(props: { afterServiceIndex: number | null }): PromiseLike<
        IEncodedResult<
          Readonly<{
            commands: readonly Schema.Schema.Type<
              typeof ServiceChainedCommandSchema
            >[];
            tip: number | null;
          }>,
          IAnyErrorJson
        >
      >;
    }>;
  }>;
  storage: Pick<DurableObjectStorage, 'setAlarm'>;
  systemId: string;
}) {
  const { command, db } = props;
  if (command.delta === null) {
    return yield* new ZerospinError({
      code: 'aggregate-command-chain-service-command-pending',
      message:
        'AggregateCommandChain only accepts terminal service occurrences',
    });
  }

  yield* props.admissionSemaphore.withPermits(1)(
    Effect.gen(function* () {
      const subscription = db
        .select()
        .from(aggregateCommandChainDrizzleSchemas.serviceSubscriptions)
        .where(
          eq(
            aggregateCommandChainDrizzleSchemas.serviceSubscriptions
              .serviceName,
            command.serviceName,
          ),
        )
        .get();
      if (subscription === undefined) {
        return yield* new ZerospinError({
          code: 'aggregate-command-chain-service-not-subscribed',
          message: `AggregateCommandChain is not subscribed to ${command.serviceName}`,
        });
      }

      const receivedBytes = yield* Schema.encodeEffect(
        Schema.fromJsonString(ServiceChainedCommandSchema),
      )(command).pipe(
        mapParseError({
          code: 'aggregate-command-chain-service-command-encode-failed',
          prefix: `Failed to encode service occurrence ${command.serviceIndex}`,
        }),
      );
      const occurrences: Schema.Schema.Type<
        typeof ServiceChainedCommandSchema
      >[] = [];
      let currentServiceIndex = subscription.serviceIndex ?? 0;
      if (command.serviceIndex <= currentServiceIndex) {
        occurrences.push(command);
      } else {
        const serviceCommandChainName =
          yield* ServiceCommandChain.fixedDORepoConfig.nameUtils.makeName({
            systemId: props.systemId,
            serviceName: command.serviceName,
          });
        const serviceCommandChain = props.serviceCommandChains.getByName(
          serviceCommandChainName,
        );
        while (currentServiceIndex < command.serviceIndex) {
          const page = yield* makeAsync<
            IEncodedResult<
              Readonly<{
                commands: readonly Schema.Schema.Type<
                  typeof ServiceChainedCommandSchema
                >[];
                tip: number | null;
              }>,
              IAnyErrorJson
            >,
            IAnyError
          >(
            () =>
              serviceCommandChain.getCommands({
                afterServiceIndex:
                  currentServiceIndex === 0 ? null : currentServiceIndex,
              }),
            ZerospinError.catch({
              code: 'aggregate-command-chain-service-history-rpc-failed',
              message: `Failed to pull ${command.serviceName} history`,
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          if (page.commands.length === 0) {
            return yield* new ZerospinError({
              code: 'aggregate-command-chain-service-history-incomplete',
              message: `Service history ended before serviceIndex ${command.serviceIndex}`,
            });
          }
          for (const occurrence of page.commands) {
            if (occurrence.serviceIndex > command.serviceIndex) break;
            if (occurrence.serviceIndex !== currentServiceIndex + 1) {
              return yield* new ZerospinError({
                code: 'aggregate-command-chain-service-index-gap',
                message: `Expected serviceIndex ${currentServiceIndex + 1}, received ${occurrence.serviceIndex}`,
              });
            }
            if (occurrence.delta === null) {
              return yield* new ZerospinError({
                code: 'aggregate-command-chain-service-history-pending',
                message: `Service history returned pending serviceIndex ${occurrence.serviceIndex}`,
              });
            }
            occurrences.push(occurrence);
            currentServiceIndex = occurrence.serviceIndex;
          }
          if (currentServiceIndex < command.serviceIndex) {
            if (page.tip === null || page.tip <= currentServiceIndex) {
              return yield* new ZerospinError({
                code: 'aggregate-command-chain-service-history-incomplete',
                message: `Service history tip did not reach serviceIndex ${command.serviceIndex}`,
              });
            }
          }
        }
      }

      const deliveredOccurrence = occurrences.at(-1);
      if (deliveredOccurrence === undefined) {
        return yield* new ZerospinError({
          code: 'aggregate-command-chain-service-history-empty',
          message: 'No service occurrence was available for admission',
        });
      }
      const deliveredBytes = yield* Schema.encodeEffect(
        Schema.fromJsonString(ServiceChainedCommandSchema),
      )(deliveredOccurrence).pipe(
        mapParseError({
          code: 'aggregate-command-chain-service-history-encode-failed',
          prefix: `Failed to encode service occurrence ${deliveredOccurrence.serviceIndex}`,
        }),
      );
      if (
        deliveredOccurrence.serviceIndex !== command.serviceIndex ||
        deliveredBytes !== receivedBytes
      ) {
        return yield* new ZerospinError({
          code: 'aggregate-command-chain-service-history-conflict',
          message: `Pulled serviceIndex ${command.serviceIndex} differs from the delivered occurrence`,
        });
      }

      for (const occurrence of occurrences) {
        const occurrenceBytes = yield* Schema.encodeEffect(
          Schema.fromJsonString(ServiceChainedCommandSchema),
        )(occurrence).pipe(
          mapParseError({
            code: 'aggregate-command-chain-service-command-encode-failed',
            prefix: `Failed to encode service occurrence ${occurrence.serviceIndex}`,
          }),
        );
        const receipt = db
          .select()
          .from(aggregateCommandChainDrizzleSchemas.serviceReceipts)
          .where(
            and(
              eq(
                aggregateCommandChainDrizzleSchemas.serviceReceipts.serviceName,
                occurrence.serviceName,
              ),
              eq(
                aggregateCommandChainDrizzleSchemas.serviceReceipts
                  .serviceIndex,
                occurrence.serviceIndex,
              ),
            ),
          )
          .get();
        if (receipt !== undefined) {
          if (
            receipt.serviceName !== occurrence.serviceName ||
            receipt.canonicalBytes !== occurrenceBytes
          ) {
            return yield* new ZerospinError({
              code: 'aggregate-command-chain-service-receipt-conflict',
              message: `Service occurrence ${occurrence.serviceIndex} differs from its retained receipt`,
            });
          }
          continue;
        }

        const liveSubscription = db
          .select()
          .from(aggregateCommandChainDrizzleSchemas.serviceSubscriptions)
          .where(
            eq(
              aggregateCommandChainDrizzleSchemas.serviceSubscriptions
                .serviceName,
              occurrence.serviceName,
            ),
          )
          .get();
        const expectedServiceIndex = (liveSubscription?.serviceIndex ?? 0) + 1;
        if (occurrence.serviceIndex !== expectedServiceIndex) {
          return yield* new ZerospinError({
            code: 'aggregate-command-chain-service-index-gap',
            message: `Expected serviceIndex ${expectedServiceIndex}, received ${occurrence.serviceIndex}`,
          });
        }

        const relevant = yield* makeAsync<
          IEncodedResult<boolean, IAnyErrorJson>,
          IAnyError
        >(
          () =>
            props.materializedAggregateRepos
              .getByName(subscription.materializedAggregateRepoName)
              .isServiceCommandRelevant({ command: occurrence }),
          ZerospinError.catch({
            code: 'aggregate-command-chain-service-relevance-rpc-failed',
            message: `Failed to determine relevance of serviceIndex ${occurrence.serviceIndex}`,
          }),
        ).pipe(Effect.flatMap(decodeRpc));

        const {
          serviceIndex: _serviceIndex,
          chainedAt: _serviceChainedAt,
          delta: _serviceDelta,
          failedAt: _serviceFailedAt,
          failure: _serviceFailure,
          ...inputCommand
        } = occurrence;
        const canonicalBytes = yield* Schema.encodeEffect(
          Schema.fromJsonString(EncodedServiceCommandSchema),
        )(inputCommand).pipe(
          mapParseError({
            code: 'aggregate-command-chain-derived-command-encode-failed',
            prefix: `Failed to encode derived service command ${occurrence.id}`,
          }),
        );
        yield* Effect.try({
          try: () =>
            db.transaction(tx => {
              const retainedSubscription = tx
                .select()
                .from(aggregateCommandChainDrizzleSchemas.serviceSubscriptions)
                .where(
                  eq(
                    aggregateCommandChainDrizzleSchemas.serviceSubscriptions
                      .serviceName,
                    occurrence.serviceName,
                  ),
                )
                .get();
              if (
                occurrence.serviceIndex !==
                (retainedSubscription?.serviceIndex ?? 0) + 1
              ) {
                throw new ZerospinError({
                  code: 'aggregate-command-chain-service-admission-conflict',
                  message: `Service frontier changed before admitting serviceIndex ${occurrence.serviceIndex}`,
                });
              }
              tx.insert(aggregateCommandChainDrizzleSchemas.serviceReceipts)
                .values({
                  serviceName: occurrence.serviceName,
                  serviceIndex: occurrence.serviceIndex,
                  canonicalBytes: occurrenceBytes,
                })
                .run();
              tx.update(
                aggregateCommandChainDrizzleSchemas.serviceSubscriptions,
              )
                .set({
                  serviceIndex: occurrence.serviceIndex,
                  lastDeliveryFailure: null,
                })
                .where(
                  eq(
                    aggregateCommandChainDrizzleSchemas.serviceSubscriptions
                      .serviceName,
                    occurrence.serviceName,
                  ),
                )
                .run();
              if (!relevant) return;

              const previous = tx
                .select({
                  aggregateIndex:
                    aggregateCommandChainDrizzleSchemas.commands.aggregateIndex,
                })
                .from(aggregateCommandChainDrizzleSchemas.commands)
                .orderBy(
                  desc(
                    aggregateCommandChainDrizzleSchemas.commands.aggregateIndex,
                  ),
                )
                .limit(1)
                .get();
              tx.insert(aggregateCommandChainDrizzleSchemas.commands)
                .values({
                  aggregateIndex: (previous?.aggregateIndex ?? 0) + 1,
                  serviceIndex: occurrence.serviceIndex,
                  commandId: occurrence.id,
                  canonicalBytes,
                  chainedAt: new Date(),
                  command: canonicalBytes,
                  result: null,
                  materializedAggregateRepoName:
                    subscription.materializedAggregateRepoName,
                })
                .run();
            }),
          catch: cause =>
            ZerospinError.isZerospinError(cause)
              ? cause
              : new ZerospinError({
                  code: 'aggregate-command-chain-service-admission-failed',
                  message: `Failed to admit serviceIndex ${occurrence.serviceIndex}`,
                  cause: ZerospinError.prettyUnknownFailure(cause),
                }),
        });
      }
    }),
  );
  yield* Effect.promise(() => props.storage.setAlarm(Date.now()));
});
