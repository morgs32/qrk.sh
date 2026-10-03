import { makeAsync } from '@zerospin/core/async/make/makeAsync';
import { readRpcEnvelope } from '@zerospin/core/utils/readRpcEnvelope';
import {
  catchZerospinError,
  type IAnyError,
  type IZerospinErrorJson,
} from '@zerospin/error';
import type { IRpcEnvelope } from '@zerospin/logger';
import config from 'config';
import { Effect } from 'effect';

import { ServiceChain } from '../../ServiceChain/ServiceChain.js';
import { ServiceVersionRepo } from '../../ServiceVersionRepo/ServiceVersionRepo.js';
const { system } = config;
/*
 * Explicit initialization awaits service chains and their version owners.
 *
 * 1. Initialize authored service chains and decode their readiness outcomes.
 * 2. Ready each service version, including pending execution publication.
 */
export const initialize = Effect.fn('SystemRepo.initialize')(function* (props: {
  serviceChains: Cloudflare.Env['SERVICE_CHAIN'];
  systemId: string;
}) {
  const { serviceChains, systemId } = props;
  // 1 — preserve awaited service readiness and its failure result
  for (const serviceName of Object.keys(system.services)) {
    const name = yield* ServiceChain.fixedDORepoConfig.nameUtils.makeName({
      systemId,
      serviceName,
    });
    yield* makeAsync<IRpcEnvelope<void, IZerospinErrorJson>, IAnyError>(
      () => serviceChains.getByName(name).ready(),
      catchZerospinError({
        code: 'system-repo-initialize-service-chain-failed',
        message: `Failed to initialize ServiceChain ${name}`,
      }),
    ).pipe(Effect.flatMap(envelope => readRpcEnvelope(envelope)));
  }
  // 2 — service owners recover pending publication and private activation work
  for (const [serviceName, versions] of Object.entries(system.services)) {
    for (const serviceVersion of Object.keys(versions)) {
      const key = { systemId, serviceName, serviceVersion };
      const repo = yield* ServiceVersionRepo.getRepo({ key });
      yield* makeAsync<IRpcEnvelope<void, IZerospinErrorJson>, IAnyError>(
        () => repo.ready(),
        catchZerospinError({
          code: 'system-repo-initialize-service-version-failed',
          message: `Failed to initialize ServiceVersionRepo ${serviceName}@${serviceVersion}`,
        }),
      ).pipe(Effect.flatMap(readRpcEnvelope));
    }
  }
});
