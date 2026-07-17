/*
 * System-worker annotation:
 * Opens generation-local admission only after SystemRepo preparation. Hosted
 * calls must match this Worker's bound deploy/generation; local hot reload uses
 * its stable DevZerospinApis control state instead of candidate bindings.
 */

import { makeAsync } from '@zerospin/core/async/makeAsync';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { ZerospinError } from '@zerospin/error';
import { env } from 'cloudflare:workers';
import { Effect } from 'effect';

import { SystemRepo } from '../SystemRepo/SystemRepo.js';

export const openGeneration = Effect.fn('SystemWorker.openGeneration')(
  function* (props: { deployId: string; generationId: string }) {
    const { deployId, generationId } = props;

    // Checkpoint 1: a hosted candidate may open only its upload-bound identity.
    if (
      env.ZEROSPIN_INSTANCE_ID !== 'local' &&
      (env.ZEROSPIN_DEPLOY_ID !== deployId ||
        env.ZEROSPIN_GENERATION_ID !== generationId)
    ) {
      return yield* new ZerospinError({
        code: 'system-worker-open-identity-mismatch',
        message:
          'The requested generation identity does not match this Worker version',
        extra: {
          deployId,
          generationId,
          boundDeployId: env.ZEROSPIN_DEPLOY_ID,
          boundGenerationId: env.ZEROSPIN_GENERATION_ID,
        },
      });
    }

    // Checkpoint 2: SystemRepo atomically moves the prepared spec and deploy
    // into active admission before Version Metadata is returned to the caller.
    const encoded = yield* makeAsync(() =>
      SystemRepo.getRepo({ generationId }).openGeneration({ deployId }),
    );
    const opened = yield* decodeRpc(encoded);
    if (
      opened.deployId !== deployId ||
      opened.generationId !== generationId
    ) {
      return yield* new ZerospinError({
        code: 'system-worker-open-result-mismatch',
        message: 'SystemRepo opened a different generation identity',
        extra: {
          deployId,
          generationId,
          openedDeployId: opened.deployId,
          openedGenerationId: opened.generationId,
        },
      });
    }

    return {
      deployId,
      generationId,
      workerVersionId: env.ZEROSPIN_VERSION_METADATA.id,
    };
  },
);
