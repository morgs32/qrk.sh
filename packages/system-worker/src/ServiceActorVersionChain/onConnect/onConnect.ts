import {
  ServiceSessionLockSchema,
  type IServiceSessionLock,
} from '@zerospin/core/serviceSession/ServiceSessionLockSchema';
import { Effect, Result, Schema } from 'effect';
import type { Connection } from 'partyserver';

/*
 * The service definition log accepts SystemRepo-forwarded upgrade context.
 * It compares the forwarded target with its bound key and initializes a
 * connection awaiting the client resume cursor.
 *
 * 1. Read the forwarded admission headers.
 * 2. Check the forwarded target against this log.
 * 3. Decode the forwarded definition lock.
 * 4. Reject an invalid lock.
 * 5. Retain admission while awaiting resume.
 */
export const onConnect = Effect.fn('ServiceActorVersionChain.onConnect')(
  function* (props: {
    connection: Connection<{
      phase: 'awaiting-resume' | 'replaying' | 'live';
      serviceName: string;
      serviceVersion: string;
      actorPath: string;
      claims: Readonly<Record<string, unknown>>;
      sessionName: string;
      serviceSessionLock: IServiceSessionLock;
    }>;
    request: Request;
    key: {
      systemId: string;
      serviceName: string;
      serviceVersion: string;
      actorPath: string;
      actorName: string;
      actorVersion: string;
    };
  }) {
    const { connection, key, request } = props;
    yield* Effect.void;

    // 1 — extract owner, actorPath, sessionName, and the encoded definition lock
    const serviceVersion = request.headers.get('x-zerospin-service-version');
    const serviceName = request.headers.get('x-zerospin-service-name');
    const actorPath = request.headers.get('x-zerospin-actor-path');
    const sessionName = request.headers.get('x-zerospin-session-name');
    const encodedServiceSessionLock = request.headers.get(
      'x-zerospin-service-session-lock',
    );

    // 2 — close with 4004 when target fields differ or the lock is absent
    if (
      serviceVersion !== key.serviceVersion ||
      serviceName !== key.serviceName ||
      actorPath !== key.actorPath ||
      sessionName === null ||
      encodedServiceSessionLock === null
    ) {
      connection.close(4004, 'service-session-target-invalid');
      return;
    }

    // 3 — reject excess fields while decoding ServiceSessionLockSchema
    const serviceSessionLockResult = yield* Schema.decodeUnknownEffect(
      Schema.fromJsonString(ServiceSessionLockSchema),
    )(encodedServiceSessionLock, {
      onExcessProperty: 'error',
    }).pipe(Effect.result);

    // 4 — close with 4004 before installing connection state
    if (
      Result.isFailure(serviceSessionLockResult) ||
      serviceSessionLockResult.success.actorName !== key.actorName ||
      serviceSessionLockResult.success.actorVersion !== key.actorVersion ||
      serviceSessionLockResult.success.sessionName !== sessionName
    ) {
      connection.close(4004, 'service-session-lock-invalid');
      return;
    }

    const claimsResult = yield* Schema.decodeUnknownEffect(
      Schema.fromJsonString(Schema.Record(Schema.String, Schema.Unknown)),
    )(request.headers.get('x-zerospin-claims')).pipe(Effect.result);
    if (Result.isFailure(claimsResult)) {
      connection.close(4004, 'session-claims-invalid');
      return;
    }

    // 5 — store phase awaiting-resume and the checked header fields
    connection.setState({
      phase: 'awaiting-resume',
      claims: claimsResult.success,
      serviceVersion,
      serviceName,
      actorPath,
      sessionName,
      serviceSessionLock: serviceSessionLockResult.success,
    });
  },
);
