import { Effect } from 'effect';

/**
 * ActorRepo resolves identity from DO name key and fanout event payload — not DO KV.
 *
 * @bad Read `storage.kv.get('accountName')` inside fanout apply paths.
 * @bad Use empty-string fallback from KV for actor identity.
 */
export const applyActorFanoutBatchInTx = Effect.fn(
  'ActorRepo.applyFanoutBatchInTx',
)(function* (props: {
  events: readonly { payload: { accountName: string; actorName: string } }[];
  tx: unknown;
  db: unknown;
}) {
  const { events, tx } = props;
  const firstEvent = events[0];
  if (firstEvent === undefined) {
    return;
  }
  const db = props.db;

  yield* applyActorDeltaFromEvent({
    db,
    tx,
    accountName: firstEvent.payload.accountName,
    actorName: firstEvent.payload.actorName,
    payload: firstEvent.payload,
  });
});

declare function applyActorDeltaFromEvent(props: {
  db: unknown;
  tx: unknown;
  accountName: string;
  actorName: string;
  payload: unknown;
}): Effect.Effect<void, unknown, unknown>;
