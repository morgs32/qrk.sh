import { AggregateSessionLockSchema } from '@zerospin/core/aggregateSession/AggregateSessionLockSchema';
import type { IDb } from '@zerospin/core/drizzle/types';
import { Effect, Result, Schema } from 'effect';
import type { Connection } from 'partyserver';

import { aggregateActorVersionChainDbConfig } from '../aggregateActorVersionChainDbConfig.js';

/*
 * The aggregate definition log accepts SystemRepo-forwarded upgrade context.
 * It checks the lock's actor against its bound key and initializes a
 * connection awaiting the client resume cursor.
 *
 * 1. Decode the forwarded definition lock.
 * 2. Reject a missing or invalid lock.
 * 3. Check the lock's actor against this log.
 * 4. Decode identity.
 * 5. Persist the lock by connection ID and retain compact admission state while awaiting resume.
 */
export const onConnect = Effect.fn('AggregateActorVersionChain.onConnect')(
  function* (props: {
    connection: Connection<{
      phase: 'awaiting-resume' | 'replaying' | 'live';
      nodeId?: string;
      admissionCommandId?: string | null;
      aggregateId: string;
      aggregateName: string;
      aggregateVersion: string;
      actorName: string;
      actorVersion: string;
      actorPath: string;
      claims: Readonly<Record<string, unknown>>;
      sessionName: string;
    }>;
    request: Request;
    db: IDb<typeof aggregateActorVersionChainDbConfig>;
    key: {
      aggregateVersion: string;
      systemId: string;
      aggregateId: string;
      aggregateName: string;
      actorName: string;
      actorVersion: string;
      actorPath: string;
    };
  }) {
    const { connection, db, key, request } = props;
    yield* Effect.void;

    // 1 — reject excess fields while decoding AggregateSessionLockSchema
    const aggregateSessionLockResult = yield* Schema.decodeUnknownEffect(
      Schema.fromJsonString(AggregateSessionLockSchema),
    )(request.headers.get('x-zerospin-aggregate-session-lock'), {
      onExcessProperty: 'error',
    }).pipe(Effect.result);

    // 2 — close with 4004 before installing connection state
    if (Result.isFailure(aggregateSessionLockResult)) {
      connection.close(4004, 'aggregate-session-lock-invalid');
      return;
    }

    // 3 — close with 4004 when the lock actor differs from this log
    if (
      aggregateSessionLockResult.success.actorName !== key.actorName ||
      aggregateSessionLockResult.success.actorVersion !== key.actorVersion
    ) {
      connection.close(4004, 'actor-capability-mismatch');
      return;
    }

    // 4 — close with 4004 when identity does not decode
    const claimsResult = yield* Schema.decodeUnknownEffect(
      Schema.fromJsonString(Schema.Record(Schema.String, Schema.Unknown)),
    )(request.headers.get('x-zerospin-claims')).pipe(Effect.result);
    if (Result.isFailure(claimsResult)) {
      connection.close(4004, 'session-claims-invalid');
      return;
    }

    // 5 — persist the admitted lock outside the size-limited WebSocket attachment.
    db.insert(aggregateActorVersionChainDbConfig.schema.connectionLocks)
      .values(
        yield* aggregateActorVersionChainDbConfig.tables.connectionLocks.encodeRow(
          {
            connectionId: connection.id,
            lock: aggregateSessionLockResult.success,
          },
        ),
      )
      .run();
    connection.setState({
      phase: 'awaiting-resume',
      claims: claimsResult.success,
      aggregateVersion: key.aggregateVersion,
      aggregateId: key.aggregateId,
      aggregateName: key.aggregateName,
      actorName: key.actorName,
      actorVersion: key.actorVersion,
      actorPath: key.actorPath,
      sessionName: aggregateSessionLockResult.success.sessionName,
    });
  },
);
