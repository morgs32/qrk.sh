/*
 * System-worker annotation:
 * Reports the identity bound to this concrete Worker version so the stable
 * control plane can reject running, failed, or stale dispatched code.
 */

import { ZerospinError } from '@zerospin/error';
import { env } from 'cloudflare:workers';
import { Effect } from 'effect';

export const getGenerationId = Effect.fn('SystemWorker.getGenerationId')(
  function* () {
    if (
      env.ZEROSPIN_DEPLOY_ID.length === 0 ||
      env.ZEROSPIN_GENERATION_ID.length === 0 ||
      env.ZEROSPIN_VERSION_METADATA.id.length === 0
    ) {
      return yield* new ZerospinError({
        code: 'system-worker-identity-binding-missing',
        message: 'SystemWorker identity bindings must be non-empty',
      });
    }

    return {
      deployId: env.ZEROSPIN_DEPLOY_ID,
      generationId: env.ZEROSPIN_GENERATION_ID,
      workerVersionId: env.ZEROSPIN_VERSION_METADATA.id,
    };
  },
);
