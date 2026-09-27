import type { IAggregateSessionLock } from '@zerospin/core/aggregateSession/AggregateSessionLockSchema';
import type { Async } from '@zerospin/core/async/Async';
import { makeAsync } from '@zerospin/core/async/make/makeAsync';
import type { IAggregateId } from '@zerospin/core/models/types';
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

import { AggregateActorVersionChain } from '../../AggregateActorVersionChain/AggregateActorVersionChain.js';
import { AggregateActorVersionRepo } from '../../AggregateActorVersionRepo/AggregateActorVersionRepo.js';
import { appendTelemetryBatch } from '../../appendTelemetryBatch/appendTelemetryBatch.js';
import { SystemRepo } from '../../SystemRepo/SystemRepo.js';

const { system } = config;

/*
 * The aggregate definition capability requests a ticket for a caller-selected
 * aggregateVersion, using its bound aggregate, user, definition, and system fields.
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
  'AggregateSessionApi.createWebSocketTicket',
)(function* (props: {
  request: IRpcRequest<[{ aggregateVersion: string }]>;
  authResults: {
    readonly aggregateId: IAggregateId;
    readonly aggregateName: string;
    aggregateVersion: string;
    readonly identity: Readonly<Record<string, unknown>>;
    actorName: string;
    actorVersion: string;
    readonly actorPath: string;
    readonly sessionName: string;
    readonly aggregateSessionLock: IAggregateSessionLock;
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
      code: 'aggregate-session-api-arguments-invalid',
      prefix:
        'AggregateSessionApi.createWebSocketTicket received invalid arguments',
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
      system.aggregates[authResults.aggregateName] ?? {},
      authResults.aggregateVersion,
    ) ||
    validatedArgs.success[0].aggregateVersion !== authResults.aggregateVersion
  ) {
    return {
      result: yield* encodeError(
        makeZerospinError({
          code: 'aggregate-version-unavailable',
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
      aggregateSessionLock,
      aggregateId,
      aggregateName,
      sessionName,
      identity,
      actorName,
      actorVersion,
      actorPath,

      systemId: configuredSystemId,
    } = authResults;
    const { aggregateVersion } = validatedArgs.success[0];

    // 4 — decode configuredSystemId as the system abbreviation ID
    const systemId = yield* Schema.decodeUnknownEffect(
      makeAbbreviationIdSchema(coreAbbreviations.system),
    )(configuredSystemId).pipe(
      mapParseError({
        code: 'aggregate-session-websocket-ticket-system-id-invalid',
        prefix: 'Failed to decode aggregate definition ticket systemId',
      }),
    );

    // 5 — use the requested owner/user/definition fields and exact aggregateVersion
    const key = {
      systemId,
      aggregateId,
      aggregateName,
      aggregateVersion,
      actorName,
      actorVersion,
      actorPath,
    };
    const repoName =
      yield* AggregateActorVersionChain.fixedDORepoConfig.nameUtils.makeName(
        key,
      );
    const aggregateActorVersionRepoName =
      yield* AggregateActorVersionRepo.fixedDORepoConfig.nameUtils.makeName(
        key,
      );

    // 6 — read SystemRepo registrations before issuing a ticket
    const systemRepo = yield* SystemRepo.getRepo({
      key: {
        systemId,
      },
    });
    const aggregateSessionRegistrations = yield* makeAsync(() =>
      systemRepo.getRepoRegistrations({
        repoType: 'AggregateActorVersionRepo',
      }),
    ).pipe(Effect.flatMap(envelope => readRpcEnvelope(envelope)));

    // 7 — return aggregate-session-state-required when the exact projection name is absent
    if (
      !aggregateSessionRegistrations.some(
        registration => registration.repoName === aggregateActorVersionRepoName,
      )
    ) {
      return yield* Effect.fail(
        makeZerospinError({
          code: 'aggregate-session-state-required',
          message:
            'Session state must initialize before a WebSocket ticket can be created',
          extra: {
            aggregateId,
            identity,
            actorName,
            actorVersion,
            actorPath,
            sessionName,
          },
        }),
      );
    }

    // 8 — persist the admitted lock with the exact definition log repoName
    const ticket = yield* makeAsync(() =>
      systemRepo.createAggregateSessionWebSocketTicket({
        aggregateVersion: authResults.aggregateVersion,
        repoName,
        aggregateId,
        aggregateName,
        identity,
        actorName,
        actorVersion,
        actorPath,
        sessionName,
        aggregateSessionLock,
      }),
    ).pipe(Effect.flatMap(envelope => readRpcEnvelope(envelope)));

    // 9 — supply the ticket for the subsequent WebSocket upgrade
    return { ticket };
  }).pipe(
    Effect.withSpan('AggregateSessionApi.createWebSocketTicket', {
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
    rootSpan.name === 'AggregateSessionApi.createWebSocketTicket'
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
