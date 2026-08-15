import { encodeLeft } from '@zerospin/core/utils/encodeLeft';
import type { IAnyError } from '@zerospin/error';
import { Effect } from 'effect';

import type { DevDeployApi } from '../../DevDeployApi.js';

export const getDeploy = Effect.fn('DevDeployApiFailure.getDeploy')(
  (props: {
    error: IAnyError;
    request: Parameters<DevDeployApi['getDeploy']>[0];
  }) => Effect.succeed(encodeLeft(props.error)),
);
