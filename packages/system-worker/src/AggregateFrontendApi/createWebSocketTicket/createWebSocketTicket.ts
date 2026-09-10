import { makeAsync } from '@zerospin/core/async/makeAsync';
import type { AggregateFrontendLockSchema } from '@zerospin/core/frontendController/makeAggregateFrontendLock';
import type { IAggregateId } from '@zerospin/core/models/types';
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
import { SelectedAggregateFrontendLockSchema } from '../../StaticSystem/frontendSpecSchemas.js';
import { validateAggregateFrontendLock } from '../../StaticSystem/validateAggregateFrontendLock/validateAggregateFrontendLock.js';
import { SystemRepo } from '../../SystemRepo/SystemRepo.js';
import { UserVersionedAggregateChain } from '../../UserVersionedAggregateChain/UserVersionedAggregateChain.js';
import { UserVersionedAggregateRepo } from '../../UserVersionedAggregateRepo/UserVersionedAggregateRepo.js';

/*
 * The aggregate frontend capability requests a ticket for a caller-selected
 * aggregateVersion, using its bound aggregate, user, frontend, and system fields.
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
  'AggregateFrontendApi.createWebSocketTicket',
)(function* (props: {
  request: IRpcRequest<[{ aggregateVersion: string }]>;
  authResults: {
    readonly aggregateId: IAggregateId;
    readonly aggregateName: string;
    aggregateVersion: string;
    readonly userId: string;
    readonly frontendName: string;
    readonly aggregateFrontendLock: Schema.Schema.Type<
      typeof AggregateFrontendLockSchema
    >;
    readonly systemId: ISystemId;
  };
}) {
  const { authResults, request } = props;

  // 1 — decode request.args and reject excess fields
  const validatedArgs = yield* Schema.decodeUnknownEffect(
    Schema.toType(
      Schema.mutable(
        Schema.Tuple([Schema.Struct({ aggregateVersion: Schema.String })]),
      ),
    ),
  )(request.args, { onExcessProperty: 'error' }).pipe(
    mapParseError({
      code: 'aggregate-frontend-api-arguments-invalid',
      prefix:
        'AggregateFrontendApi.createWebSocketTicket received invalid arguments',
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
      system.aggregates[authResults.aggregateName] ?? {},
      authResults.aggregateVersion,
    ) ||
    validatedArgs.success[0].aggregateVersion !== authResults.aggregateVersion
  ) {
    return {
      result: yield* encodeRpc(
        Effect.fail(
          new ZerospinError({
            code: 'aggregate-version-unavailable',
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
      aggregateFrontendLock,
      aggregateId,
      aggregateName,
      frontendName,
      userId,
      systemId: configuredSystemId,
    } = authResults;
    const { aggregateVersion } = validatedArgs.success[0];

    // 4 — decode configuredSystemId as the system abbreviation ID
    const systemId = yield* Schema.decodeUnknownEffect(
      makeAbbreviationIdSchema(coreAbbreviations.system),
    )(configuredSystemId).pipe(
      mapParseError({
        code: 'aggregate-frontend-websocket-ticket-system-id-invalid',
        prefix: 'Failed to decode aggregate frontend ticket systemId',
      }),
    );

    // 5 — resolve and decode the selected aggregate frontend definition
    const selectedUnknown = yield* validateAggregateFrontendLock({
      aggregateVersion: authResults.aggregateVersion,
      aggregateName,
      frontendName,
      aggregateFrontendLock,
    });
    const selected = yield* Schema.decodeUnknownEffect(
      SelectedAggregateFrontendLockSchema,
    )(selectedUnknown, { onExcessProperty: 'error' }).pipe(
      mapParseError({
        code: 'system-runtime-aggregate-frontend-lock-invalid',
        prefix:
          'The static System returned an invalid selected aggregate frontend lock',
      }),
    );

    // 6 — use the requested owner/user/frontend fields and exact aggregateVersion
    const key = {
      systemId,
      aggregateId,
      aggregateName,
      aggregateVersion,
      userId,
    };
    const repoName =
      yield* UserVersionedAggregateChain.fixedDORepoConfig.nameUtils.makeName(
        key,
      );
    const userVersionedAggregateRepoName =
      yield* UserVersionedAggregateRepo.fixedDORepoConfig.nameUtils.makeName(
        key,
      );

    // 7 — read SystemRepo registrations before issuing a ticket
    const systemRepo = yield* SystemRepo.getRepo({
      key: {
        systemId,
      },
    });
    const aggregateFrontendRegistrations = yield* makeAsync(() =>
      systemRepo.getRepoRegistrations({
        repoType: 'UserVersionedAggregateRepo',
      }),
    ).pipe(Effect.flatMap(decodeRpc));

    // 8 — return aggregate-frontend-state-required when the exact projection name is absent
    if (
      !aggregateFrontendRegistrations.some(
        registration =>
          registration.repoName === userVersionedAggregateRepoName,
      )
    ) {
      return yield* new ZerospinError({
        code: 'aggregate-frontend-state-required',
        message:
          'Frontend state must initialize before a WebSocket ticket can be created',
        extra: {
          aggregateId,
          userId,
          frontendName,
        },
      });
    }

    // 9 — persist the selected lock with the exact frontend log repoName
    const ticket = yield* makeAsync(() =>
      systemRepo.createAggregateFrontendWebSocketTicket({
        aggregateVersion: authResults.aggregateVersion,
        repoName,
        aggregateId,
        aggregateName,
        userId,
        frontendName,
        aggregateFrontendLock: selected.aggregateFrontendLock,
      }),
    ).pipe(Effect.flatMap(decodeRpc));

    // 10 — supply the ticket for the subsequent WebSocket upgrade
    return { ticket };
  }).pipe(
    Effect.withSpan('AggregateFrontendApi.createWebSocketTicket', {
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
    rootSpan.name === 'AggregateFrontendApi.createWebSocketTicket'
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
