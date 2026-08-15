import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { encodeRpc } from '@zerospin/core/utils/encodeRpc';
import { ZerospinError } from '@zerospin/error';
import { Effect } from 'effect';

import type { SystemRepo } from '../../SystemRepo/SystemRepo.js';

export const getReadiness = Effect.fn('DevDeployApi.getReadiness')(
  (props: { systemRepo: Pick<SystemRepo, 'getReadiness'> }) =>
    Effect.tryPromise({
      try: () => props.systemRepo.getReadiness(),
      catch: cause =>
        ZerospinError.isZerospinError(cause)
          ? cause
          : new ZerospinError({
              code: 'failed-to-get-readiness-rpc',
              message: 'SystemRepo.getReadiness threw',
              cause: ZerospinError.prettyUnknownFailure(cause),
            }),
    }).pipe(Effect.flatMap(decodeRpc), encodeRpc),
);
