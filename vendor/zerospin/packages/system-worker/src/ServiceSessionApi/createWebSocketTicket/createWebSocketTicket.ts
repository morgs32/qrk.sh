import type { Async } from '@zerospin/core/async/Async';
import { makeAsync } from '@zerospin/core/async/make/makeAsync';
import type { IServiceSessionLock } from '@zerospin/core/serviceSession/ServiceSessionLockSchema';
import type { ISystemId } from '@zerospin/core/system/types';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { readRpcEnvelope } from '@zerospin/core/utils/readRpcEnvelope';
import {
  encodeError,
  makeZerospinError,
  mapParseError,
  type IAnyError,
  type IZerospinErrorJson,
} from '@zerospin/error';
import {
  makeRpcEnvelope,
  makeSpanLinkId,
  type IRpcRequest,
  type ISpanLinkRecord,
} from '@zerospin/logger';
import { makeAbbreviationIdSchema } from '@zerospin/schema';
import config from 'config';
import { Effect, Exit, Result, Schema } from 'effect';

import { appendTelemetryBatch } from '../../appendTelemetryBatch/appendTelemetryBatch.js';
import { ServiceActorVersionChain } from '../../ServiceActorVersionChain/ServiceActorVersionChain.js';
import { ServiceActorVersionRepo } from '../../ServiceActorVersionRepo/ServiceActorVersionRepo.js';
import { SystemRepo } from '../../SystemRepo/SystemRepo.js';

const { system } = config;

/*
 * The service definition capability requests a ticket for a caller-selected
 * serviceVersion, using its bound service, user, definition, and system fields.
 * SystemRepo owns ticket persistence and later consumption.
 *
 * 1. Validate the request arguments.
 * 2. Return invalid arguments immediately.
 * 3. Collect the operation under the API root span.
 * 4. Validate the configured deployment ID.
 * 5. Encode the projection and definition log names.
 * 6. Require the projection registration.
 * 7. Reject ticket issuance before definition state exists.
 * 8. Mint the bound ticket in SystemRepo.
 * 9. Return the issued credential.
 * 10. Encode the settled domain outcome.
 * 11. Persist telemetry and determine the trace link.
 * 12. Return the linked RPC envelope.
 */
export const createWebSocketTicket = Effect.fn(
  'ServiceSessionApi.createWebSocketTicket',
)(function* (props: {
  request: IRpcRequest<[{ serviceVersion: string }]>;
  authResults: {
    readonly serviceName: string;
    serviceVersion: string;
    readonly claims: Readonly<Record<string, unknown>>;
    readonly actorPath: string;
    readonly sessionName: string;
    readonly serviceSessionLock: IServiceSessionLock;
    readonly systemId: ISystemId;
  };
}) {
  const { authResults, request } = props;

  // 1 — decode request.args and reject excess fields
  const validatedArgs = yield* Schema.decodeUnknownEffect(
    Schema.toType(
      Schema.mutable(
        Schema.Tuple([Schema.Struct({ serviceVersion: Schema.String })]),
      ),
    ),
  )(request.args, { onExcessProperty: 'error' }).pipe(
    mapParseError({
      code: 'service-session-api-arguments-invalid',
      prefix:
        'ServiceSessionApi.createWebSocketTicket received invalid arguments',
    }),
    Effect.result,
  );

  // 2 — encode the validation failure with a null trace link
  if (Result.isFailure(validatedArgs)) {
    return {
      result: yield* encodeError(validatedArgs.failure).pipe(
        Effect.map(failure => ({ _tag: 'Failure' as const, failure })),
      ),
      link: null,
    };
  }

  if (
    !Object.hasOwn(
      system.services[authResults.serviceName] ?? {},
      authResults.serviceVersion,
    ) ||
    validatedArgs.success[0].serviceVersion !== authResults.serviceVersion
  ) {
    return {
      result: yield* encodeError(
        makeZerospinError({
          code: 'service-version-unavailable',
          message:
            'The requested version is not available through this capability',
        }),
      ).pipe(Effect.map(failure => ({ _tag: 'Failure' as const, failure }))),
      link: null,
    };
  }

  // 3 — collect and settle the operation under the API root span
  const settled = yield* Effect.gen(function* (): Effect.gen.Return<
    { ticket: string },
    IAnyError | IZerospinErrorJson,
    Async
  > {
    const {
      sessionName,
      serviceSessionLock,
      serviceName,
      claims,
      actorPath,

      systemId: configuredSystemId,
    } = authResults;
    const { serviceVersion } = validatedArgs.success[0];

    // 4 — decode configuredSystemId as the system abbreviation ID
    const systemId = yield* Schema.decodeUnknownEffect(
      makeAbbreviationIdSchema(coreAbbreviations.system),
    )(configuredSystemId).pipe(
      mapParseError({
        code: 'service-session-websocket-ticket-system-id-invalid',
        prefix: 'Failed to decode service definition ticket systemId',
      }),
    );

    // 5 — use the requested owner/user/definition fields
    const key = {
      systemId,
      serviceName,
      serviceVersion,
      actorPath,
      actorName: serviceSessionLock.actorName,
      actorVersion: serviceSessionLock.actorVersion,
    };
    const repoName =
      yield* ServiceActorVersionChain.fixedDORepoConfig.nameUtils.makeName(key);
    const serviceActorVersionRepoName =
      yield* ServiceActorVersionRepo.fixedDORepoConfig.nameUtils.makeName(key);

    // 6 — read SystemRepo registrations before issuing a ticket
    const systemRepo = yield* SystemRepo.getRepo({
      key: {
        systemId,
      },
    });
    const projectionRegistrations = yield* makeAsync(() =>
      systemRepo.getRepoRegistrations({
        repoType: 'ServiceActorVersionRepo',
      }),
    ).pipe(Effect.flatMap(envelope => readRpcEnvelope(envelope)));

    // 7 — return service-session-state-required when the exact projection name is absent
    if (
      !projectionRegistrations.some(
        registration => registration.repoName === serviceActorVersionRepoName,
      )
    ) {
      return yield* Effect.fail(
        makeZerospinError({
          code: 'service-session-state-required',
          message:
            'Service definition state must initialize before a WebSocket ticket can be created',
          extra: {
            serviceName,
            serviceVersion,
            claims,
            actorPath,
            sessionName,
          },
        }),
      );
    }

    // 8 — persist the admitted lock with the exact definition log repoName
    const ticket = yield* makeAsync(() =>
      systemRepo.createServiceSessionWebSocketTicket({
        repoName,
        serviceName,
        serviceVersion,
        claims,
        actorPath,
        sessionName,
        serviceSessionLock,
      }),
    ).pipe(Effect.flatMap(envelope => readRpcEnvelope(envelope)));

    // 9 — supply the ticket for the subsequent WebSocket upgrade
    return { ticket };
  }).pipe(
    Effect.withSpan('ServiceSessionApi.createWebSocketTicket', {
      root: true,
    }),
    makeRpcEnvelope,
  );

  // 10 — preserve success or typed failure before attempting telemetry persistence
  const result = settled.result;

  // 11 — emit a link only after persistence succeeds and the root span matches this method
  const batch = settled.telemetry;
  const persisted = yield* appendTelemetryBatch({ batch }).pipe(Effect.exit);
  const rootSpan = batch.spans.at(-1);
  const link: ISpanLinkRecord | null =
    Exit.isSuccess(persisted) &&
    request.traceContext !== null &&
    rootSpan !== undefined &&
    rootSpan.parentSpanId === null &&
    rootSpan.name === 'ServiceSessionApi.createWebSocketTicket'
      ? {
          linkId: makeSpanLinkId(),
          traceId: rootSpan.traceId,
          spanId: rootSpan.spanId,
          priorTraceId: request.traceContext.traceId,
          priorSpanId: request.traceContext.parentSpanId,
          kind: 'causedBy',
        }
      : null;

  // 12 — return the domain result even when no trace link can be emitted
  return { result, link };
});
