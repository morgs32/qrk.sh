import { encodeLeft } from '@zerospin/core/utils/encodeLeft';
import type { IAnyError } from '@zerospin/error';
import { Effect } from 'effect';

import type { DevDeployApi } from '../../DevDeployApi.js';

export const startDeploy = Effect.fn('DevDeployApiFailure.startDeploy')(
  (props: {
    error: IAnyError;
    request: Parameters<DevDeployApi['startDeploy']>[0];
  }) => Effect.succeed(encodeLeft(props.error)),
);
