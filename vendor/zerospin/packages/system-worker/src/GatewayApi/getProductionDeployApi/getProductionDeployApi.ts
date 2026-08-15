import { ZerospinError } from '@zerospin/error';
import { Effect } from 'effect';

import { ProductionDeployApi } from '../../ProductionDeployApi/ProductionDeployApi.js';
import { ProductionDeployApiFailure } from '../../ProductionDeployApi/ProductionDeployApiFailure/ProductionDeployApiFailure.js';
import type { SystemRepo } from '../../SystemRepo/SystemRepo.js';

export const getProductionDeployApi = Effect.fn(
  'GatewayApi.getProductionDeployApi',
)(
  (props: {
    environment: 'dev' | 'production';
    systemRepo: Pick<SystemRepo, 'getReadiness'>;
  }) =>
    Effect.succeed(
      props.environment === 'production'
        ? new ProductionDeployApi({ systemRepo: props.systemRepo })
        : new ProductionDeployApiFailure(
            new ZerospinError({
              code: 'production-deploy-api-unavailable',
              message:
                'The Production deploy API is unavailable in Development',
              status: 400,
            }),
          ),
    ),
);
