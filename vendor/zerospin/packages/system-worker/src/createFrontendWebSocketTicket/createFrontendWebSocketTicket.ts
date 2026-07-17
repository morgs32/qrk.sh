/*
 * System-worker annotation:
 * Resolves the authenticated frontend projection to its FrontendBlockRepo name
 * and asks the generation-local SystemRepo to mint the admission capability.
 */

import type { IActorId } from '@zerospin/core/models/types';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { Effect } from 'effect';

import { FrontendBlockRepo } from '../FrontendBlockRepo/FrontendBlockRepo.js';
import { SystemRepo } from '../SystemRepo/SystemRepo.js';

export const createFrontendWebSocketTicket = Effect.fn(
  'SystemWorker.createFrontendWebSocketTicket',
  { root: true },
)(function* (props: {
  deployId: string;
  generationId: string;
  accountId: string;
  accountName: string;
  actorId: IActorId;
  actorName: string;
  frontendName: string;
}) {
  // Checkpoint 1: derive the sole durable-object target while the full
  // authenticated frontend identity is still available at this RPC boundary.
  const repoName = yield* FrontendBlockRepo.repoUtils.nameUtils.makeName({
    generationId: props.generationId,
    accountId: props.accountId,
    accountName: props.accountName,
    actorId: props.actorId,
    actorName: props.actorName,
    frontendName: props.frontendName,
  });

  // Checkpoint 2: SystemRepo owns admission, expiry, hashing, and one-use state.
  const encoded = yield* makeAsync(() =>
    SystemRepo.getRepo({
      generationId: props.generationId,
    }).createFrontendWebSocketTicket({
      deployId: props.deployId,
      repoName,
    }),
  );
  return yield* decodeRpc(encoded);
});
