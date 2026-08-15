import { ZerospinError } from '@zerospin/error';
import { Effect } from 'effect';

import { DevDeployApi } from '../../DevDeployApi/DevDeployApi.js';
import { DevDeployApiFailure } from '../../DevDeployApi/DevDeployApiFailure/DevDeployApiFailure.js';
import type { SystemRepo } from '../../SystemRepo/SystemRepo.js';

export const getDevDeployApi = Effect.fn('GatewayApi.getDevDeployApi')(
  (props: {
    environment: 'dev' | 'production';
    systemRepo: Pick<SystemRepo, 'getDeploy' | 'getReadiness' | 'startDeploy'>;
  }) =>
    Effect.succeed(
      props.environment === 'dev'
        ? new DevDeployApi({ systemRepo: props.systemRepo })
        : new DevDeployApiFailure(
            new ZerospinError({
              code: 'dev-deploy-api-unavailable',
              message: 'The Dev deploy API is unavailable in Production',
              status: 400,
            }),
          ),
    ),
);
