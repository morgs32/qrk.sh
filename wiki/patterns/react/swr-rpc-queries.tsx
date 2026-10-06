import { newSyncRpcSession } from '@zerospin/core/utils/getApi/newSyncRpcSession/newSyncRpcSession';
import { ZerospinErrorJsonSchema } from '@zerospin/error';
import { makeAbbreviationIdSchema } from '@zerospin/shapes';
import { Schema } from 'effect';
import useSWR from 'swr';

import type { StudioAgentApi } from '../../../packages/studio/src/StudioAgentApi/StudioAgentApi';

/**
 * Use keyed SWR reads with one disposable Cap'n Web session inside each fetcher.
 * Include every query identity field in the key; use null when the query is disabled.
 * Validate encoded outcomes and success data, retaining structured failure as Error.cause.
 * Let a Studio-local RPC method hold administrative credentials on the server.
 * Use bound mutate() for Retry; focus/reconnect refresh without timer polling.
 *
 * @bad Maintain query data, loading, errors, and a refresh counter in a fetch useEffect.
 * @bad Retain one RPC session across renders or fetcher executions.
 * @bad Send the system secret from the browser or expose the full SystemApi capability.
 * @bad Omit aggregate version from the key while the server checks version availability.
 */
export function useAggregateIds(
  aggregateName: string | undefined,
  aggregateVersion: string | undefined,
) {
  return useSWR(
    aggregateName === undefined || aggregateVersion === undefined
      ? null
      : ['aggregate-ids', aggregateName, aggregateVersion],
    async ([, name, version]: [string, string, string]) => {
      using api = newSyncRpcSession<StudioAgentApi>('/api/agents/rpc');
      const outcome: unknown = await api.getAgentAggregateIds({
        aggregateName: name,
        aggregateVersion: version,
      });
      const result = Schema.decodeUnknownSync(
        Schema.Union([
          Schema.Struct({
            _tag: Schema.Literal('Success'),
            success: Schema.Array(makeAbbreviationIdSchema('acct')),
          }),
          Schema.Struct({
            _tag: Schema.Literal('Failure'),
            failure: ZerospinErrorJsonSchema,
          }),
        ]),
      )(outcome);
      if (result._tag === 'Failure') {
        throw new Error(result.failure.message, { cause: result.failure });
      }
      return result.success;
    },
    {
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
      shouldRetryOnError: false,
      refreshInterval: 0,
      keepPreviousData: false,
    },
  );
}
