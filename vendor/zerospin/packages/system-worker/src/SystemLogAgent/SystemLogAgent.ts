import { makeAsync } from '@zerospin/core/async/makeAsync';
import { makeAbbreviationIdSchema } from '@zerospin/core/models/makeIdSchema';
import type {
  ISystemLogRow,
  ISystemLogState,
} from '@zerospin/core/system/types';
import { cloudIdAbbreviations } from '@zerospin/core/utils/cloudIdAbbreviations';
import { defaultRetrySchedule } from '@zerospin/core/utils/defaultRetrySchedule';
import { mapParseError, ZerospinError } from '@zerospin/error';
import { Agent, type Connection, type ConnectionContext } from 'agents';
import { Effect, Either, Schema } from 'effect';

import { getSystemLogRepo } from '../SystemLogRepo/getSystemLogRepo/getSystemLogRepo.js';
import { systemLogRowSchema } from '../SystemLogRepo/SystemLogRepo.js';
import { managedRuntime } from '../managedRuntime.js';

export class SystemLogAgent extends Agent<Env, ISystemLogState> {
  override initialState: ISystemLogState = {
    rows: [],
    syncedAt: 0,
  };

  /*
   * 1. Read the Agent instance name.
   * 2. Validate the name as a generation id.
   * 3. Resolve the authoritative SystemLogRepo.
   * 4. Retry the latest-row RPC and decode its wire result.
   * 5. Fail after retry exhaustion.
   * 6. Replace the persisted Agent projection.
   */
  override async onStart(): Promise<void> {
    // 1 — Agent names stay aligned with the generation-scoped repo name
    const name = this.name;
    const rows = await managedRuntime.runPromise(
      Effect.gen(function* () {
        // 2 — reject unnamed or malformed activations before any repo lookup
        const generationId = yield* Schema.validate(
          makeAbbreviationIdSchema(cloudIdAbbreviations.generation),
        )(name).pipe(
          mapParseError({
            code: 'failed-to-decode-system-log-agent-generation-id',
            prefix: 'Failed to decode SystemLogAgent generationId',
            extra: { generationId: name },
          }),
        );
        // 3 — preserve SystemLogRepo naming policy by using the lookup boundary
        const systemLogRepo = yield* getSystemLogRepo({
          key: { generationId },
        });
        // 4 — retry both transport failures and encoded SystemLogRepo failures three times total
        return yield* makeAsync(() =>
          systemLogRepo.getSystemLogRows({ limit: 100 }),
        ).pipe(
          Effect.flatMap(encoded =>
            Schema.decodeUnknown(
              Schema.Either({
                left: ZerospinError.schema,
                right: Schema.Array(Schema.typeSchema(systemLogRowSchema)),
              }),
            )(encoded).pipe(
              mapParseError({
                code: 'failed-to-decode-system-log-agent-rows',
                prefix: 'Failed to decode SystemLogAgent rows',
              }),
            ),
          ),
          Effect.flatMap(result =>
            Either.isLeft(result) ? result.left : Effect.succeed(result.right),
          ),
          // 5 — leave the exhausted error in the failure channel so activation fails
          Effect.retry({ schedule: defaultRetrySchedule }),
        );
      }),
    );
    // 6 — authoritative startup always replaces, rather than merges with, persisted state
    this.setState({ rows, syncedAt: Date.now() });
  }

  override shouldConnectionBeReadonly(
    _connection: Connection,
    _context: ConnectionContext,
  ): boolean {
    return true;
  }

  /*
   * 1. Combine persisted and incoming rows.
   * 2. Deduplicate rows by identity.
   * 3. Materialize the deduplicated projection.
   * 4. Order exclusively by descending log index.
   * 5. Persist and broadcast the newest 100 rows.
   */
  async pushLogRows(rows: readonly ISystemLogRow[]): Promise<void> {
    // 1 — include persisted rows so incremental delivery never discards prior state
    const rowsById = new Map(
      // 2 — incoming retries replace the same id instead of duplicating it
      [...this.state.rows, ...rows].map(row => [row.id, row]),
    );
    // 3 — Map values are the complete idempotent projection before ordering
    const stateRows = [...rowsById.values()]
      // 4 — timestamps and ids never participate in projection ordering
      .sort((left, right) => right.logIndex - left.logIndex)
      .slice(0, 100);
    // 5 — Agent setState persists and emits the Cloudflare state protocol update
    this.setState({ rows: stateRows, syncedAt: Date.now() });
  }
}
