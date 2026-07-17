/*
 * System-worker annotation:
 * Encodes one actor block outbox record into SQLite JSON columns. Shared by
 * the pre-publish transactional upsert and the post-publish upsert.
 */

import {
  EncodedExecutedAccountCommandSchema,
  EncodedFailedAccountCommandSchema,
  ExecutedPushedCommandSchema,
  FailedPushedCommandSchema,
} from '@zerospin/core/contracts/CommandSchema';
import { EncodedAppliedMutationSchema } from '@zerospin/core/contracts/encodeAppliedMutation';
import { mapParseError, ZerospinError, type IAnyError } from '@zerospin/error';
import { Effect, Schema } from 'effect';

import { ActorDeltaSchema } from '../../blockSchemas.js';
import type { IActorBlockOutboxRecord } from '../../types.js';

export const encodeActorBlockOutboxColumns = Effect.fn(
  'ActorRepo.encodeActorBlockOutboxColumns',
)(function* (props: { record: IActorBlockOutboxRecord }): Effect.fn.Return<
  {
    executedCommands: string;
    failedCommands: string;
    appliedMutations: string;
    deltas: string;
    failure: string | null;
  },
  IAnyError
> {
  const { record } = props;
  const executedCommands = yield* Schema.encode(
    Schema.parseJson(
      Schema.Array(
        Schema.Union(
          EncodedExecutedAccountCommandSchema,
          ExecutedPushedCommandSchema,
        ),
      ),
    ),
  )(record.executedCommands).pipe(
    mapParseError({
      code: 'actor-repo-outbox-executed-commands-encode-failed',
      prefix: 'Failed to encode executed commands for ActorRepo outbox row',
    }),
  );
  const failedCommands = yield* Schema.encode(
    Schema.parseJson(
      Schema.Array(
        Schema.Union(
          EncodedFailedAccountCommandSchema,
          FailedPushedCommandSchema,
        ),
      ),
    ),
  )(record.failedCommands).pipe(
    mapParseError({
      code: 'actor-repo-outbox-failed-commands-encode-failed',
      prefix: 'Failed to encode failed commands for ActorRepo outbox row',
    }),
  );
  const appliedMutations = yield* Schema.encode(
    Schema.parseJson(Schema.Array(EncodedAppliedMutationSchema)),
  )(record.appliedMutations).pipe(
    mapParseError({
      code: 'actor-repo-outbox-applied-mutations-encode-failed',
      prefix: 'Failed to encode applied mutations for ActorRepo outbox row',
    }),
  );
  const deltas = yield* Schema.encode(
    Schema.parseJson(
      Schema.Record({
        key: Schema.String,
        value: ActorDeltaSchema,
      }),
    ),
  )(record.deltas).pipe(
    mapParseError({
      code: 'actor-repo-outbox-deltas-encode-failed',
      prefix: 'Failed to encode deltas for ActorRepo outbox row',
    }),
  );
  const failure = yield* Schema.encode(
    Schema.NullOr(Schema.parseJson(ZerospinError.schema)),
  )(record.failure).pipe(
    mapParseError({
      code: 'actor-repo-outbox-publish-failure-encode-failed',
      prefix: 'Failed to encode ActorRepo outbox publish failure',
    }),
  );

  return {
    executedCommands,
    failedCommands,
    appliedMutations,
    deltas,
    failure,
  };
});
