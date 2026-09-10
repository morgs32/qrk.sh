import { makeAsync } from '@zerospin/core/async/makeAsync';
import type { ServiceFrontendLockSchema } from '@zerospin/core/frontendController/makeServiceFrontendLock';
import type { ISystemId } from '@zerospin/core/system/types';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { encodeRpc } from '@zerospin/core/utils/encodeRpc';
import { mapParseError, ZerospinError } from '@zerospin/error';
import {
  makeSpanLinkId,
  makeTelemetryCollector,
  makeTelemetryLayer,
  type IRpcRequest,
  type ISpanLinkRecord,
} from '@zerospin/logger';
import { makeAbbreviationIdSchema } from '@zerospin/schema';
import { Effect, Result, Schema } from 'effect';
import { system } from 'system';

import { appendTelemetryBatch } from '../../appendTelemetryBatch/appendTelemetryBatch.js';
import { FrontendServiceChain } from '../../FrontendServiceChain/FrontendServiceChain.js';
import { FrontendVersionedServiceRepo } from '../../FrontendVersionedServiceRepo/FrontendVersionedServiceRepo.js';
import { SelectedServiceFrontendLockSchema } from '../../StaticSystem/frontendSpecSchemas.js';
import { validateServiceFrontendLock } from '../../StaticSystem/validateServiceFrontendLock/validateServiceFrontendLock.js';
import { SystemRepo } from '../../SystemRepo/SystemRepo.js';

/*
 * The service frontend capability requests a ticket for a caller-selected
 * serviceVersion, using its bound service, user, frontend, and system fields.
 * SystemRepo owns ticket persistence and later consumption.
 *
 * 1. Validate the request arguments.
 * 2. Return invalid arguments immediately.
 * 3. Collect the operation under the API root span.
 * 4. Validate the configured deployment ID.
 * 5. Validate the submitted frontend lock.
 * 6. Encode the projection and frontend log names.
 * 7. Require the projection registration.
 * 8. Reject ticket issuance before frontend state exists.
 * 9. Mint the bound ticket in SystemRepo.
 * 10. Return the issued credential.
 * 11. Encode the settled domain outcome.
 * 12. Persist telemetry and determine the trace link.
 * 13. Return the linked RPC envelope.
 */
export const createWebSocketTicket = Effect.fn(
  'ServiceFrontendApi.createWebSocketTicket',
)(function* (props: {
  request: IRpcRequest<[{ serviceVersion: string }]>;
  authResults: {
    readonly serviceName: string;
    serviceVersion: string;
    readonly userId: string;
    readonly frontendName: string;
    readonly serviceFrontendLock: Schema.Schema.Type<
      typeof ServiceFrontendLockSchema
    >;
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
      code: 'service-frontend-api-arguments-invalid',
      prefix:
        'ServiceFrontendApi.createWebSocketTicket received invalid arguments',
    }),
    Effect.result,
  );

  // 2 — encode the validation failure with a null trace link
  if (Result.isFailure(validatedArgs)) {
    return {
      result: yield* encodeRpc(Effect.fail(validatedArgs.failure)),
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
      result: yield* encodeRpc(
        Effect.fail(
          new ZerospinError({
            code: 'service-version-unavailable',
            message:
              'The requested version is not available through this capability',
          }),
        ),
      ),
      link: null,
    };
  }

  // 3 — collect and settle the operation under the API root span
  const collector = makeTelemetryCollector();
  const settled = yield* Effect.gen(function* () {
    const {
      frontendName,
      serviceFrontendLock,
      serviceName,
      userId,
      systemId: configuredSystemId,
    } = authResults;
    const { serviceVersion } = validatedArgs.success[0];

    // 4 — decode configuredSystemId as the system abbreviation ID
    const systemId = yield* Schema.decodeUnknownEffect(
      makeAbbreviationIdSchema(coreAbbreviations.system),
    )(configuredSystemId).pipe(
      mapParseError({
        code: 'service-frontend-websocket-ticket-system-id-invalid',
        prefix: 'Failed to decode service frontend ticket systemId',
      }),
    );

    // 5 — resolve and decode the selected service frontend definition
    const selectedUnknown = yield* validateServiceFrontendLock({
      serviceVersion: authResults.serviceVersion,
      serviceName,
      frontendName,
      serviceFrontendLock,
    });
    const selected = yield* Schema.decodeUnknownEffect(
      SelectedServiceFrontendLockSchema,
    )(selectedUnknown, { onExcessProperty: 'error' }).pipe(
      mapParseError({
        code: 'system-runtime-service-frontend-lock-invalid',
        prefix:
          'The static System returned an invalid selected service frontend lock',
      }),
    );

    // 6 — use the requested owner/user/frontend fields
    const key = {
      systemId,
      serviceName,
      serviceVersion,
      userId,
      frontendName,
    };
    const repoName =
      yield* FrontendServiceChain.fixedDORepoConfig.nameUtils.makeName(key);
    const frontendVersionedServiceRepoName =
      yield* FrontendVersionedServiceRepo.fixedDORepoConfig.nameUtils.makeName(
        key,
      );

    // 7 — read SystemRepo registrations before issuing a ticket
    const systemRepo = yield* SystemRepo.getRepo({
      key: {
        systemId,
      },
    });
    const projectionRegistrations = yield* makeAsync(() =>
      systemRepo.getRepoRegistrations({
        repoType: 'FrontendVersionedServiceRepo',
      }),
    ).pipe(Effect.flatMap(decodeRpc));

    // 8 — return service-frontend-state-required when the exact projection name is absent
    if (
      !projectionRegistrations.some(
        registration =>
          registration.repoName === frontendVersionedServiceRepoName,
      )
    ) {
      return yield* new ZerospinError({
        code: 'service-frontend-state-required',
        message:
          'Service frontend state must initialize before a WebSocket ticket can be created',
        extra: {
          serviceName,
          serviceVersion,
          userId,
          frontendName,
        },
      });
    }

    // 9 — persist the selected lock with the exact frontend log repoName
    const ticket = yield* makeAsync(() =>
      systemRepo.createServiceFrontendWebSocketTicket({
        repoName,
        serviceName,
        serviceVersion,
        userId,
        frontendName,
        serviceFrontendLock: selected.serviceFrontendLock,
      }),
    ).pipe(Effect.flatMap(decodeRpc));

    // 10 — supply the ticket for the subsequent WebSocket upgrade
    return { ticket };
  }).pipe(
    Effect.withSpan('ServiceFrontendApi.createWebSocketTicket', {
      root: true,
    }),
    Effect.provide(makeTelemetryLayer(collector)),
    Effect.result,
  );

  // 11 — preserve success or typed failure before attempting telemetry persistence
  const result = yield* Result.match(settled, {
    onFailure: error => encodeRpc(Effect.fail(error)),
    onSuccess: value => encodeRpc(Effect.succeed(value)),
  });

  // 12 — emit a link only after persistence succeeds and the root span matches this method
  const batch = collector.flush();
  const persisted = yield* appendTelemetryBatch({ batch }).pipe(Effect.result);
  const rootSpan = batch.spans.at(-1);
  const link: ISpanLinkRecord | null =
    Result.isSuccess(persisted) &&
    request.traceContext !== null &&
    rootSpan !== undefined &&
    rootSpan.parentSpanId === null &&
    rootSpan.name === 'ServiceFrontendApi.createWebSocketTicket'
      ? {
          linkId: makeSpanLinkId(),
          traceId: rootSpan.traceId,
          spanId: rootSpan.spanId,
          priorTraceId: request.traceContext.traceId,
          priorSpanId: request.traceContext.parentSpanId,
          kind: 'causedBy',
        }
      : null;

  // 13 — return the domain result even when no trace link can be emitted
  return { result, link };
});
