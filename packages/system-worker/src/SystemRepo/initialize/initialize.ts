import { makeAsync } from '@zerospin/core/async/makeAsync';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import {
  ZerospinError,
  type IAnyError,
  type IAnyErrorJson,
  type IEncodedResult,
} from '@zerospin/error';
import { Effect } from 'effect';
import { system } from 'system';

import { ServiceAdmittedChain } from '../../ServiceAdmittedChain/ServiceAdmittedChain.js';

/*
 * Explicit initialization awaits authored service-chain readiness.
 *
 * 1. Initialize authored service chains and decode their readiness outcomes.
 */
export const initialize = Effect.fn('SystemRepo.initialize')(function* (props: {
  serviceAdmittedChains: Cloudflare.Env['SERVICE_ADMITTED_CHAIN'];
  systemId: string;
}) {
  const { serviceAdmittedChains, systemId } = props;

  // 1 — preserve awaited service readiness and its failure result
  for (const serviceName of Object.keys(system.services)) {
    const name =
      yield* ServiceAdmittedChain.fixedDORepoConfig.nameUtils.makeName({
        systemId,
        serviceName,
      });
    yield* makeAsync<IEncodedResult<void, IAnyErrorJson>, IAnyError>(
      () => serviceAdmittedChains.getByName(name).ready(),
      ZerospinError.catch({
        code: 'system-repo-initialize-service-chain-failed',
        message: `Failed to initialize ServiceAdmittedChain ${name}`,
      }),
    ).pipe(Effect.flatMap(decodeRpc));
  }
});
