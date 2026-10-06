import { encodeRpcOutcome } from '@zerospin/core/utils/encodeRpcOutcome';
import { makeTelemetryCollector, makeTelemetryLayer } from '@zerospin/logger';
import { RpcTarget } from 'capnweb';
import { Effect } from 'effect';

import { getAgentAggregateIds } from './getAgentAggregateIds/getAgentAggregateIds.js';

/** Expose the Studio aggregate-ID read without exposing administrative credentials. */
export class StudioAgentApi extends RpcTarget {
  readonly #zerospinApiUrl: string;
  readonly #zerospinSecretKey: string;

  constructor(props: { zerospinApiUrl: string; zerospinSecretKey: string }) {
    super();
    this.#zerospinApiUrl = props.zerospinApiUrl;
    this.#zerospinSecretKey = props.zerospinSecretKey;
  }

  async getAgentAggregateIds(props: {
    aggregateName: string;
    aggregateVersion: string;
  }) {
    const collector = makeTelemetryCollector();
    try {
      return await Effect.runPromise(
        getAgentAggregateIds({
          ...props,
          zerospinApiUrl: this.#zerospinApiUrl,
          zerospinSecretKey: this.#zerospinSecretKey,
        }).pipe(
          encodeRpcOutcome,
          Effect.withSpan('Studio.getAgentAggregateIds', { root: true }),
          Effect.provide(makeTelemetryLayer(collector)),
        ),
      );
    } finally {
      collector.flush();
    }
  }
}
