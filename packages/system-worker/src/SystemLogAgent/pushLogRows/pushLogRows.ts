import type {
  ISystemLogRow,
  ISystemLogState,
} from '@zerospin/core/system/types';
import { Effect } from 'effect';

/*
 * Incremental log delivery updates the Agent projection by stable row ID.
 * It retains the newest 100 logIndex values before persisting and broadcasting.
 *
 * 1. Combine persisted and incoming rows.
 * 2. Deduplicate rows by identity.
 * 3. Materialize the deduplicated projection.
 * 4. Order exclusively by descending log index.
 * 5. Persist and broadcast the newest 100 rows.
 */
export const pushLogRows = Effect.fn('SystemLogAgent.pushLogRows')(
  function* (props: {
    currentRows: readonly ISystemLogRow[];
    rows: readonly ISystemLogRow[];
    setState: (state: ISystemLogState) => void;
  }) {
    const { currentRows, rows, setState } = props;

    // 1 — include persisted rows so incremental delivery never discards prior state
    const rowsById = new Map(
      // 2 — incoming retries replace the same id instead of duplicating it
      [...currentRows, ...rows].map(row => [row.id, row]),
    );

    // 3 — Map values are the complete idempotent projection before ordering
    const stateRows = [...rowsById.values()]

      // 4 — timestamps and ids never participate in projection ordering
      .sort((left, right) => right.logIndex - left.logIndex)
      .slice(0, 100);

    // 5 — Agent setState persists and emits the Cloudflare state protocol update
    yield* Effect.sync(() =>
      setState({ rows: stateRows, syncedAt: Date.now() }),
    );
  },
);
