import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeAsync } from '@zerospin/core/async/make/makeAsync';
import type { IAnyContracts } from '@zerospin/core/contracts/types';
import { readRpcEnvelope } from '@zerospin/core/utils/readRpcEnvelope';
import { makeZerospinError } from '@zerospin/error';
import { makeAbbreviationIdSchema, makeEffectSchema } from '@zerospin/schema';
import { env } from 'cloudflare:workers';
import { Effect, Schema } from 'effect';

import type { ServiceChain as IServiceChain } from '../ServiceChain/ServiceChain.js';
import type { ServiceVersionRepo as IServiceVersionRepo } from '../ServiceVersionRepo/ServiceVersionRepo.js';
export const trustedService = Effect.fn('shopping.trustedService')(function* (
  serviceName: string,
  serviceVersion: string,
  contracts: IAnyContracts,
) {
  const { ServiceChain } = yield* Effect.promise(
    () => import('../ServiceChain/ServiceChain.js'),
  );
  const { ServiceVersionRepo } = yield* Effect.promise(
    () => import('../ServiceVersionRepo/ServiceVersionRepo.js'),
  );
  const systemId = Schema.decodeUnknownSync(
    Schema.Struct({ ZEROSPIN_SYSTEM_ID: Schema.String }),
  )(env).ZEROSPIN_SYSTEM_ID;
  const repo = yield* ServiceVersionRepo.getRepo({
    key: { systemId, serviceName, serviceVersion },
  });
  return {
    query: (queryName: string, params: unknown) =>
      makeAsync<
        Awaited<ReturnType<IServiceVersionRepo['executeServiceQuery']>>
      >(() =>
        repo.executeServiceQuery({ serviceName, queryName, params }),
      ).pipe(
        Effect.flatMap(envelope => readRpcEnvelope(envelope)),
        Effect.mapError(failure =>
          makeZerospinError({ code: failure.code, message: failure.message }),
        ),
        Effect.provide(AsyncLive),
      ),
    execute: Effect.fn(function* (
      commandName: string,
      payload: unknown,
      commandId?: `cmd_${string}`,
    ) {
      const contract = contracts[commandName];
      if (contract === undefined) {
        return yield* makeZerospinError('unknown-service-contract');
      }
      const encoded = yield* Schema.encodeUnknownEffect(
        makeEffectSchema(contract.payload),
      )(payload).pipe(
        Effect.mapError(() => makeZerospinError('invalid-service-payload')),
      );
      const id =
        commandId ??
        Schema.decodeUnknownSync(makeAbbreviationIdSchema('cmd'))(
          `cmd_${Array.from(new TextEncoder().encode(JSON.stringify({ commandName, payload })), byte => byte.toString(16).padStart(2, '0')).join('')}`,
        );
      const chain = yield* ServiceChain.getRepo({
        key: { systemId, serviceName },
      });
      const receipt = yield* makeAsync<
        Awaited<ReturnType<IServiceChain['admitServiceCommand']>>
      >(() =>
        chain.admitServiceCommand({
          command: {
            id,
            serviceName,
            serviceVersion,
            commandName,
            contractVersion: contract.version,
            payload: JSON.stringify(encoded),
          },
        }),
      ).pipe(
        Effect.flatMap(envelope => readRpcEnvelope(envelope)),
        Effect.mapError(failure =>
          makeZerospinError({ code: failure.code, message: failure.message }),
        ),
        Effect.provide(AsyncLive),
      );
      return yield* makeAsync<
        Awaited<ReturnType<IServiceVersionRepo['execute']>>
      >(() => repo.execute({ serviceIndex: receipt.serviceIndex })).pipe(
        Effect.flatMap(envelope => readRpcEnvelope(envelope)),
        Effect.mapError(failure =>
          makeZerospinError({ code: failure.code, message: failure.message }),
        ),
        Effect.provide(AsyncLive),
      );
    }),
  };
});
