import { makeAsync } from '@zerospin/core/async/makeAsync';
import type {
  IChainedCommand,
  IEncodedCommand,
  ISessionCommand,
} from '@zerospin/core/contracts/types';
import type { AggregateFrontendLockSchema } from '@zerospin/core/frontendController/makeAggregateFrontendLock';
import type { IAggregateId } from '@zerospin/core/models/types';
import { SessionCommandSchema } from '@zerospin/core/session/AggregateFrontendCommandSchema';
import type { IFrontendDelta } from '@zerospin/core/session/types';
import type { ISystemId } from '@zerospin/core/system/types';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { encodeRpc } from '@zerospin/core/utils/encodeRpc';
import {
  mapParseError,
  ZerospinError,
  type IAnyErrorJson,
  type IEncodedResult,
} from '@zerospin/error';
import {
  makeSpanLinkId,
  makeTelemetryCollector,
  makeTelemetryLayer,
  type IRpcRequest,
  type ISpanLinkRecord,
} from '@zerospin/logger';
import { Effect, Result, Schema } from 'effect';
import { system } from 'system';

import { AggregateChain } from '../../AggregateChain/AggregateChain.js';
import { SystemLogRepo } from '../../SystemLogRepo/SystemLogRepo.js';

/*
 * The aggregate frontend capability admits a complete locally committed
 * occurrence into AggregateChain. It returns the admission receipt;
 * version-owned server execution and frontend publication happen downstream.
 *
 * 1. Validate the request arguments.
 * 2. Return invalid arguments immediately.
 * 3. Check the complete occurrence against the capability.
 * 4. Resolve the admitted aggregate owner.
 * 5. Collect and settle the domain operation.
 * 6. Encode the settled domain outcome.
 * 7. Persist telemetry and determine the trace link.
 * 8. Return the linked RPC envelope.
 */
export const pushCommand = Effect.fn('AggregateFrontendApi.pushCommand')(
  function* (props: {
    request: IRpcRequest<
      [
        {
          readonly command: IEncodedCommand<
            IChainedCommand<ISessionCommand, IFrontendDelta> &
              Readonly<{ sessionIndex: number; pushIndex: null }>
          >;
        },
      ]
    >;
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
    const validated = yield* Schema.decodeUnknownEffect(
      Schema.toType(
        Schema.mutable(
          Schema.Tuple([Schema.Struct({ command: SessionCommandSchema })]),
        ),
      ),
    )(request.args, { onExcessProperty: 'error' }).pipe(
      mapParseError({
        code: 'aggregate-frontend-api-arguments-invalid',
        prefix: 'AggregateFrontendApi.pushCommand received invalid arguments',
      }),
      Effect.result,
    );

    // 2 — encode the validation failure with a null trace link
    if (Result.isFailure(validated)) {
      return {
        result: yield* encodeRpc(Effect.fail(validated.failure)),
        link: null,
      };
    }

    if (
      !Object.hasOwn(
        system.aggregates[authResults.aggregateName] ?? {},
        authResults.aggregateVersion,
      )
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

    // 3 — compare aggregateId, aggregateName, userId, frontendName, systemName, pushIndex, and delta
    const command = validated.success[0].command;
    if (
      command.aggregateId !== authResults.aggregateId ||
      command.aggregateName !== authResults.aggregateName ||
      command.userId !== authResults.userId ||
      command.frontendName !== authResults.frontendName ||
      command.systemName !== authResults.aggregateFrontendLock.systemName ||
      command.pushIndex !== null ||
      command.delta === null
    ) {
      return {
        result: yield* encodeRpc(
          Effect.fail(
            new ZerospinError({
              code: 'aggregate-frontend-command-target-mismatch',
              message:
                'Pushed command must be a terminal committed occurrence matching the admitted aggregate frontend',
            }),
          ),
        ),
        link: null,
      };
    }

    const selectedContract =
      authResults.aggregateFrontendLock.contracts[command.commandName];
    if (
      selectedContract === undefined ||
      selectedContract.commandName !== command.commandName ||
      selectedContract.version !== command.contractVersion
    ) {
      return {
        result: yield* encodeRpc(
          Effect.fail(
            new ZerospinError({
              code: 'aggregate-frontend-command-contract-unavailable',
              message: 'Command is not selected by the admitted frontend lock',
            }),
          ),
        ),
        link: null,
      };
    }

    // 4 — bind systemId, aggregateId, and aggregateName from the capability
    const chain = yield* AggregateChain.getRepo({
      key: {
        systemId: authResults.systemId,
        aggregateId: authResults.aggregateId,
        aggregateName: authResults.aggregateName,
      },
    });

    // 5 — submit the full occurrence and require the first admission receipt
    const collector = makeTelemetryCollector();
    const settled = yield* makeAsync(() =>
      chain.admitCommands({ commands: [command] }),
    ).pipe(
      Effect.flatMap(decodeRpc),
      Effect.flatMap(receipts =>
        receipts[0] === undefined
          ? Effect.fail(
              new ZerospinError({
                code: 'aggregate-admission-receipt-missing',
                message: 'Admission returned no receipt',
              }),
            )
          : Effect.succeed(receipts[0]),
      ),
      Effect.withSpan('AggregateFrontendApi.pushCommand', { root: true }),
      Effect.provide(makeTelemetryLayer(collector)),
      Effect.result,
    );

    // 6 — preserve success or typed failure before attempting telemetry persistence
    const result = yield* Result.match(settled, {
      onFailure: error => encodeRpc(Effect.fail(error)),
      onSuccess: value => encodeRpc(Effect.succeed(value)),
    });

    // 7 — emit a link only after persistence succeeds and the root span matches this method
    const batch = collector.flush();
    const persisted = yield* Effect.gen(function* () {
      const systemLogRepo = yield* SystemLogRepo.getRepo({
        key: { systemId: authResults.systemId },
      });
      return yield* makeAsync<IEncodedResult<void, IAnyErrorJson>>(() =>
        systemLogRepo.appendTelemetryBatch({ batch }),
      ).pipe(Effect.flatMap(decodeRpc));
    }).pipe(Effect.result);
    const rootSpan = batch.spans.at(-1);
    const link: ISpanLinkRecord | null =
      Result.isSuccess(persisted) &&
      request.traceContext !== null &&
      rootSpan !== undefined &&
      rootSpan.parentSpanId === null &&
      rootSpan.name === 'AggregateFrontendApi.pushCommand'
        ? {
            linkId: makeSpanLinkId(),
            traceId: rootSpan.traceId,
            spanId: rootSpan.spanId,
            priorTraceId: request.traceContext.traceId,
            priorSpanId: request.traceContext.parentSpanId,
            kind: 'causedBy',
          }
        : null;

    // 8 — return the domain result even when no trace link can be emitted
    return { result, link };
  },
);
