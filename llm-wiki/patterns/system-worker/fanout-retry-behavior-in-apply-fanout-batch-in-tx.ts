import { Effect } from 'effect';

/**
 * Fanout apply handlers return success payload or `null`; idempotent retry lives in fanout helpers.
 *
 * @bad Add custom `prev*Cursor` handshake checks in repo fanout handlers.
 * @bad Perform ad-hoc RPC lookups to detect whether a fanout step already ran.
 */
export const applyFrontendFanoutBatchInTx = Effect.fn(
  'FrontendRepo.applyFanoutBatchInTx',
)(function* (props: { events: readonly unknown[]; tx: unknown }) {
  const { events, tx } = props;

  const applied = yield* decodeAndApplyFrontendDeltaBatch({
    tx,
    events,
  });

  if (applied === null) {
    return null;
  }

  return { frontendDeltaCursor: applied.cursor };
});

declare function decodeAndApplyFrontendDeltaBatch(props: {
  tx: unknown;
  events: readonly unknown[];
}): Effect.Effect<{ cursor: string } | null, unknown, unknown>;
