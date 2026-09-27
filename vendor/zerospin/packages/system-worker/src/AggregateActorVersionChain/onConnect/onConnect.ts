import {
  AggregateSessionLockSchema,
  type IAggregateSessionLock,
} from '@zerospin/core/aggregateSession/AggregateSessionLockSchema';
import { Effect, Result, Schema } from 'effect';
import type { Connection } from 'partyserver';

/*
 * The aggregate definition log accepts SystemRepo-forwarded upgrade context.
 * It checks the lock's actor against its bound key and initializes a
 * connection awaiting the client resume cursor.
 *
 * 1. Decode the forwarded definition lock.
 * 2. Reject a missing or invalid lock.
 * 3. Check the lock's actor against this log.
 * 4. Decode identity.
 * 5. Retain admission while awaiting resume.
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
      aggregateSessionLock: IAggregateSessionLock;
    }>;
    request: Request;
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
    const { connection, key, request } = props;
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

    // 5 — store phase awaiting-resume from the repo key and the lock
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
      aggregateSessionLock: aggregateSessionLockResult.success,
    });
  },
);
