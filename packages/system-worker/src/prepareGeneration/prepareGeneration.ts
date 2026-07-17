/*
 * System-worker annotation:
 * Prepares one reuse, detached clean, or migrated generation through its
 * generation-local SystemRepo before activation may open admission.
 */

import { makeAsync } from '@zerospin/core/async/makeAsync';
import type { IDeploySeedCommand } from '@zerospin/core/contracts/types';
import type { ISystemSpec } from '@zerospin/core/system/types';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { ZerospinError } from '@zerospin/error';
import { env } from 'cloudflare:workers';
import { Effect } from 'effect';

import { SystemRepo } from '../SystemRepo/SystemRepo.js';

export const prepareGeneration = Effect.fn('SystemWorker.prepareGeneration')(
  function* (props: {
    deployId: string;
    generationId: string;
    prevGenerationId: string | null;
    systemSpec: ISystemSpec;
    seeds: readonly IDeploySeedCommand[];
  }) {
    const {
      deployId,
      generationId,
      prevGenerationId,
      seeds,
      systemSpec,
    } = props;

    // Checkpoint 1: hosted preparation is tied to the concrete uploaded Worker
    // whose code and Version Metadata are being considered for activation.
    if (
      env.ZEROSPIN_INSTANCE_ID !== 'local' &&
      (env.ZEROSPIN_DEPLOY_ID !== deployId ||
        env.ZEROSPIN_GENERATION_ID !== generationId)
    ) {
      return yield* new ZerospinError({
        code: 'system-worker-prepare-identity-mismatch',
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

    // Checkpoint 2: SystemRepo performs the blocking compatibility, seed, or
    // replay workflow and reports readiness only after its postconditions hold.
    const encoded = yield* makeAsync(() =>
      SystemRepo.getRepo({ generationId }).prepareGeneration({
        deployId,
        prevGenerationId,
        systemSpec,
        seeds,
      }),
    );
    const prepared = yield* decodeRpc(encoded);
    if (
      prepared.deployId !== deployId ||
      prepared.generationId !== generationId ||
      prepared.readiness !== 'ready'
    ) {
      return yield* new ZerospinError({
        code: 'system-worker-prepare-result-mismatch',
        message: 'SystemRepo prepared a different generation identity',
        extra: {
          deployId,
          generationId,
          preparedDeployId: prepared.deployId,
          preparedGenerationId: prepared.generationId,
          preparedReadiness: prepared.readiness,
        },
      });
    }

    return prepared;
  },
);
