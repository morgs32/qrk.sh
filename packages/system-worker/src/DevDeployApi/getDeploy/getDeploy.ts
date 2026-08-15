import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { encodeRpc } from '@zerospin/core/utils/encodeRpc';
import { ZerospinError } from '@zerospin/error';
import { Effect } from 'effect';

import type { SystemRepo } from '../../SystemRepo/SystemRepo.js';

export const getDeploy = Effect.fn('DevDeployApi.getDeploy')(
  (props: {
    request: { deployId: string };
    systemRepo: Pick<SystemRepo, 'getDeploy'>;
  }) =>
    Effect.tryPromise({
      try: () => props.systemRepo.getDeploy(props.request),
      catch: cause =>
        ZerospinError.isZerospinError(cause)
          ? cause
          : new ZerospinError({
              code: 'failed-to-get-deploy-rpc',
              message: 'SystemRepo.getDeploy threw',
              cause: ZerospinError.prettyUnknownFailure(cause),
            }),
    }).pipe(Effect.flatMap(decodeRpc), encodeRpc),
);
