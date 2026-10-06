import { getApi } from '@zerospin/core/utils/getApi/getApi';
import { Effect } from 'effect';
import type { GatewayApi } from 'system-worker/GatewayApi/GatewayApi';

export const getAgentAggregateIds = Effect.fn(
  'StudioAgentApi.getAgentAggregateIds',
)(function* (props: {
  aggregateName: string;
  aggregateVersion: string;
  zerospinApiUrl: string;
  zerospinSecretKey: string;
}) {
  const systemApi = yield* getApi<GatewayApi>(props.zerospinApiUrl)(
    gatewayApi =>
      gatewayApi.getSystemApi({
        zerospinSecretKey: props.zerospinSecretKey,
      }),
  );
  return yield* systemApi.getAgentAggregateIds({
    aggregateName: props.aggregateName,
    aggregateVersion: props.aggregateVersion,
  });
});
