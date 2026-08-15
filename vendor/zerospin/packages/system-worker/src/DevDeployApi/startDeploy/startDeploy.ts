import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { encodeRpc } from '@zerospin/core/utils/encodeRpc';
import { ZerospinError } from '@zerospin/error';
import { Effect } from 'effect';

import type { SystemRepo } from '../../SystemRepo/SystemRepo.js';

export const startDeploy = Effect.fn('DevDeployApi.startDeploy')(
  (props: {
    request: { clean: boolean };
    systemRepo: Pick<SystemRepo, 'startDeploy'>;
  }) =>
    Effect.tryPromise({
      try: () => props.systemRepo.startDeploy(props.request),
      catch: cause =>
        ZerospinError.isZerospinError(cause)
          ? cause
          : new ZerospinError({
              code: 'failed-to-start-deploy-rpc',
              message: 'SystemRepo.startDeploy threw',
              cause: ZerospinError.prettyUnknownFailure(cause),
            }),
    }).pipe(Effect.flatMap(decodeRpc), encodeRpc),
);
