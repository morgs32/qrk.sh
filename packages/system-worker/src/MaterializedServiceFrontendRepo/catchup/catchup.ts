import type { Async } from '@zerospin/core/async/Async';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import type { ServiceChainedCommandSchema } from '@zerospin/core/contracts/CommandSchema';
import type { IDb } from '@zerospin/core/drizzle/types';
import type { IModel } from '@zerospin/core/models/types';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import {
  ZerospinError,
  type IAnyError,
  type IAnyErrorJson,
  type IEncodedResult,
} from '@zerospin/error';
import type { IAnyDrizzleSchemas } from '@zerospin/schema';
import { eq } from 'drizzle-orm';
import { Effect, type Schema } from 'effect';

import { getServiceCommandChain } from '../../ServiceCommandChain/getServiceCommandChain/getServiceCommandChain.js';
import { execute } from '../execute/execute.js';
import { materializedServiceFrontendRepoDrizzleSchemas } from '../MaterializedServiceFrontendRepoDbConfig.js';

export const catchup = Effect.fn('MaterializedServiceFrontendRepo.catchup')(
  function* (props: {
    db: IDb;
    key: {
      systemId: string;
      serviceName: string;
      userId: string;
      frontendName: string;
    };
    serviceFrontendRepoSchema: IAnyDrizzleSchemas &
      Record<`serviceSource_${string}`, IModel['drizzleSchema']>;
    storage: Pick<DurableObjectStorage, 'setAlarm'>;
    throughServiceIndex: number | undefined;
  }): Effect.fn.Return<void, IAnyError, Async> {
    const serviceCommandChain = yield* getServiceCommandChain({
      key: {
        systemId: props.key.systemId,
        serviceName: props.key.serviceName,
      },
    });
    let currentServiceIndex =
      props.db
        .select()
        .from(
          materializedServiceFrontendRepoDrizzleSchemas.materializationState,
        )
        .where(
          eq(
            materializedServiceFrontendRepoDrizzleSchemas.materializationState
              .id,
            1,
          ),
        )
        .get()?.serviceIndex ?? 0;
    let targetServiceIndex = props.throughServiceIndex;
    while (
      targetServiceIndex === undefined ||
      currentServiceIndex < targetServiceIndex
    ) {
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
          code: 'materialized-service-frontend-history-rpc-failed',
          message: `Failed to pull ${props.key.serviceName} history`,
        }),
      ).pipe(Effect.flatMap(decodeRpc));
      if (targetServiceIndex === undefined) {
        targetServiceIndex = page.tip ?? currentServiceIndex;
      }
      if (page.commands.length === 0) {
        if (currentServiceIndex < targetServiceIndex) {
          return yield* new ZerospinError({
            code: 'materialized-service-frontend-history-incomplete',
            message: `Service history ended before serviceIndex ${targetServiceIndex}`,
          });
        }
        return;
      }
      for (const command of page.commands) {
        if (command.serviceIndex > targetServiceIndex) {
          break;
        }
        if (command.serviceIndex !== currentServiceIndex + 1) {
          return yield* new ZerospinError({
            code: 'materialized-service-frontend-history-gap',
            message: `Expected serviceIndex ${currentServiceIndex + 1}, received ${command.serviceIndex}`,
          });
        }
        if (command.delta === null) {
          return yield* new ZerospinError({
            code: 'materialized-service-frontend-history-pending',
            message: `Service history returned pending serviceIndex ${command.serviceIndex}`,
          });
        }
        yield* execute({
          command,
          db: props.db,
          key: props.key,
          serviceFrontendRepoSchema: props.serviceFrontendRepoSchema,
          storage: props.storage,
        });
        currentServiceIndex = command.serviceIndex;
      }
      if (
        currentServiceIndex < targetServiceIndex &&
        (page.tip === null || page.tip <= currentServiceIndex)
      ) {
        return yield* new ZerospinError({
          code: 'materialized-service-frontend-history-incomplete',
          message: `Service history tip did not reach serviceIndex ${targetServiceIndex}`,
        });
      }
    }
  },
);
