import { makeAsync } from '@zerospin/core/async/make/makeAsync';
import type { ISystemLogState } from '@zerospin/core/system/types';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { readRpcEnvelope } from '@zerospin/core/utils/readRpcEnvelope';
import {
  makeZerospinError,
  mapParseError,
  ZerospinErrorSchema,
} from '@zerospin/error';
import { TelemetryBatchSchema } from '@zerospin/logger';
import { makeAbbreviationIdSchema } from '@zerospin/schema';
import { Effect, Schema } from 'effect';

import { SystemLogRepo } from '../../SystemLogRepo/SystemLogRepo.js';
import { systemLogRepoDbConfig } from '../../SystemLogRepo/systemLogRepoDbConfig.js';

/*
 * SystemLogAgent activation replaces its persisted live-tail projection with
 * the newest authoritative SystemLogRepo rows for the configured systemId.
 *
 * 1. Read the Agent instance name.
 * 2. Validate the name as the configured system id.
 * 3. Resolve the authoritative SystemLogRepo.
 * 4. Call the latest-row RPC once and decode its wire result.
 * 5. Replace the persisted Agent projection.
 */
export const onStart = Effect.fn('SystemLogAgent.onStart')(function* (props: {
  name: string;
  systemId: string;
  setState: (state: ISystemLogState) => void;
}) {
  // 1 — Agent names stay aligned with the static SystemLogRepo name
  const { setState, name, systemId } = props;

  // 2 — reject unnamed or malformed activations before any repo lookup
  const agentSystemId = yield* Schema.decodeUnknownEffect(
    Schema.toType(makeAbbreviationIdSchema(coreAbbreviations.system)),
  )(name).pipe(
    mapParseError({
      code: 'failed-to-decode-system-log-agent-system-id',
      prefix: 'Failed to decode SystemLogAgent systemId',
      extra: { systemId: name },
    }),
  );
  if (agentSystemId !== systemId) {
    return yield* Effect.fail(
      makeZerospinError({
        code: 'system-log-agent-system-id-mismatch',
        message: 'SystemLogAgent name does not match the configured systemId',
        extra: { agentSystemId, systemId },
      }),
    );
  }

  // 3 — preserve SystemLogRepo naming policy by using the lookup boundary
  const systemLogRepo = yield* SystemLogRepo.getRepo({
    key: { systemId },
  });

  // 4 — activation performs one SystemLogRepo read
  const rows = yield* makeAsync(() =>
    systemLogRepo.getSystemLogRows({ limit: 100 }),
  ).pipe(
    Effect.flatMap(envelope =>
      Schema.decodeUnknownEffect(
        Schema.Struct({
          result: Schema.Union([
            Schema.Struct({
              _tag: Schema.Literal('Success'),
              success: Schema.Array(
                Schema.toType(systemLogRepoDbConfig.tables.logs.codec),
              ),
            }),
            Schema.Struct({
              _tag: Schema.Literal('Failure'),
              failure: ZerospinErrorSchema,
            }),
          ]),
          telemetry: TelemetryBatchSchema,
        }),
      )(envelope).pipe(
        mapParseError({
          code: 'failed-to-decode-system-log-agent-rows',
          prefix: 'Failed to decode SystemLogAgent envelope',
        }),
      ),
    ),
    Effect.flatMap(readRpcEnvelope),
  );

  // 5 — authoritative startup always replaces, rather than merges with, persisted state
  yield* Effect.sync(() => setState({ rows, syncedAt: Date.now() }));
});
