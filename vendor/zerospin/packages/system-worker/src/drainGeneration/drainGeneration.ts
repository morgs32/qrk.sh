/*
 * System-worker annotation:
 * Closes one active generation through its generation-local SystemRepo. Hosted
 * calls must address the deploy and generation bound to this Worker version;
 * self-hosted control resolves that identity from its durable lifecycle state.
 */

import { makeAsync } from '@zerospin/core/async/makeAsync';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { ZerospinError } from '@zerospin/error';
import { env } from 'cloudflare:workers';
import { Effect } from 'effect';

import { SystemRepo } from '../SystemRepo/SystemRepo.js';

export const drainGeneration = Effect.fn('SystemWorker.drainGeneration')(
  function* (props: {
    deployId: string;
    generationId: string;
    mode: 'freeze' | 'complete';
    successorGenerationId: string | null;
  }) {
    const { deployId, generationId, mode, successorGenerationId } = props;

    // Checkpoint 1: hosted orchestration cannot drain an arbitrary lineage by
    // calling a different uploaded Worker version. Self-hosted control cannot
    // bind a candidate identity that is allocated after the upload completes.
    if (
      env.ZEROSPIN_SELF_HOSTED !== 'true' &&
      (env.ZEROSPIN_DEPLOY_ID !== deployId ||
        env.ZEROSPIN_GENERATION_ID !== generationId)
    ) {
      return yield* new ZerospinError({
        code: 'system-worker-drain-identity-mismatch',
        message:
          'The requested hosted generation identity does not match this Worker version',
        extra: {
          deployId,
          generationId,
          boundDeployId: env.ZEROSPIN_DEPLOY_ID,
          boundGenerationId: env.ZEROSPIN_GENERATION_ID,
        },
      });
    }

    // Checkpoint 2: the SystemRepo owns close, dependency-ordered drain, and
    // immutable replay-bound capture for the generation.
    const encoded = yield* makeAsync(() =>
      SystemRepo.getRepo({ generationId }).drainGeneration({
        deployId,
        mode,
        successorGenerationId,
      }),
    );
    const drained = yield* decodeRpc(encoded);
    if (
      drained.deployId !== deployId ||
      drained.generationId !== generationId ||
      drained.admission !== (mode === 'freeze' ? 'draining' : 'drained')
    ) {
      return yield* new ZerospinError({
        code: 'system-worker-drain-result-mismatch',
        message:
          'SystemRepo returned a different generation drain identity or mode',
        extra: {
          deployId,
          generationId,
          mode,
          drainedDeployId: drained.deployId,
          drainedGenerationId: drained.generationId,
          drainedAdmission: drained.admission,
        },
      });
    }

    return drained;
  },
);
