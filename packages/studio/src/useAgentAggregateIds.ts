import type { IAggregateId } from '@zerospin/core/models/types';
import { newSyncRpcSession } from '@zerospin/core/utils/getApi/newSyncRpcSession/newSyncRpcSession';
import { ZerospinErrorJsonSchema } from '@zerospin/error';
import { makeAbbreviationIdSchema } from '@zerospin/shapes';
import { Schema } from 'effect';
import useSWR from 'swr';

import type { StudioAgentApi } from './StudioAgentApi/StudioAgentApi.js';

const aggregateIdsResultSchema = Schema.Union([
  Schema.Struct({
    _tag: Schema.Literal('Success'),
    success: Schema.Array(makeAbbreviationIdSchema('acct')),
  }),
  Schema.Struct({
    _tag: Schema.Literal('Failure'),
    failure: ZerospinErrorJsonSchema,
  }),
]);

export async function fetchAgentAggregateIds(
  props: { aggregateName: string; aggregateVersion: string },
  apiUrl = '/api/agents/rpc',
) {
  using api = newSyncRpcSession<StudioAgentApi>(apiUrl);
  const outcome: unknown = await api.getAgentAggregateIds(props);
  const result = Schema.decodeUnknownSync(aggregateIdsResultSchema)(outcome);
  if (result._tag === 'Failure') {
    throw new Error(result.failure.message, { cause: result.failure });
  }
  return result.success;
}

type IAggregateIdsKey = readonly ['agent-aggregate-ids', string, string];

export function useAgentAggregateIds({
  aggregateName,
  aggregateVersion,
  enabled,
}: {
  aggregateName: string | undefined;
  aggregateVersion: string | undefined;
  enabled: boolean;
}) {
  const key: IAggregateIdsKey | null =
    enabled && aggregateName !== undefined && aggregateVersion !== undefined
      ? ['agent-aggregate-ids', aggregateName, aggregateVersion]
      : null;

  return useSWR<readonly IAggregateId[], Error>(
    key,
    ([, name, version]: IAggregateIdsKey) =>
      fetchAgentAggregateIds({
        aggregateName: name,
        aggregateVersion: version,
      }),
    {
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
      shouldRetryOnError: false,
      refreshInterval: 0,
      keepPreviousData: false,
    },
  );
}
