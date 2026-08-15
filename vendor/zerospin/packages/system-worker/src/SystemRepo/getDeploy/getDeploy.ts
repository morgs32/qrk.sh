import { makeAsync } from '@zerospin/core/async/makeAsync';
import type { IDb } from '@zerospin/core/drizzle/types';
import { makeAbbreviationIdSchema } from '@zerospin/core/models/makeIdSchema';
import type { IAnyDrizzleSchema } from '@zerospin/core/models/types';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { mapParseError, ZerospinError } from '@zerospin/error';
import { eq, type AnyColumn } from 'drizzle-orm';
import { Effect, ParseResult, Schema } from 'effect';

export const getDeploy = Effect.fn('SystemRepo.getDeploy')(function* (props: {
  db: IDb;
  request: { deployId: string };
  readiness: Promise<void>;
  environment: 'dev' | 'production';
  scheduleActivation: (deployId: string) => Promise<void>;
  deployTable: IAnyDrizzleSchema;
  deployColumns: Readonly<{
    id: AnyColumn;
  }>;
}) {
  if (props.environment === 'production') {
    return yield* new ZerospinError({
      code: 'system-deploy-control-unavailable',
      message: 'Dev deploy control is unavailable in Production',
      status: 400,
    });
  }
  yield* makeAsync(() => props.readiness);
  const request = yield* Schema.validate(
    Schema.Struct({
      deployId: makeAbbreviationIdSchema(coreAbbreviations.deploy),
    }),
  )(props.request, { onExcessProperty: 'error' }).pipe(
    Effect.mapError(
      error =>
        new ZerospinError({
          code: 'system-deploy-status-request-invalid',
          message: `Deploy status request is invalid: ${ParseResult.TreeFormatter.formatErrorSync(error)}`,
          status: 400,
        }),
    ),
  );
  const rawDeploy = yield* Effect.try({
    try: () =>
      props.db
        .select()
        .from(props.deployTable)
        .where(eq(props.deployColumns.id, request.deployId))
        .get(),
    catch: ZerospinError.catch({
      code: 'system-deploy-status-read-failed',
      message: 'Failed to read deploy status',
      status: 500,
      extra: { deployId: request.deployId },
    }),
  });
  if (rawDeploy === undefined) {
    return yield* new ZerospinError({
      code: 'system-deploy-status-not-found',
      message: 'Deploy not found',
      status: 404,
      extra: { deployId: request.deployId },
    });
  }
  const deploy = yield* Schema.decodeUnknown(
    Schema.Struct({
      id: Schema.String,
      workerVersionId: Schema.String,
      generationId: Schema.String,
      clean: Schema.Boolean,
      status: Schema.Literal('activating', 'succeeded', 'failed'),
      activationCheckpoint: Schema.Literal(
        'allocated',
        'generation-prepared',
        'continuous-replay',
        'pre-cut-ready',
        'ownership-cut',
        'source-writes-terminal',
        'fixed-point-drained',
        'final-replay-complete',
      ),
      failure: Schema.NullOr(Schema.parseJson(ZerospinError.schema)),
    }),
  )(rawDeploy).pipe(
    mapParseError({
      code: 'system-deploy-status-invalid',
      prefix: 'Stored deploy status is invalid',
      extra: { deployId: request.deployId },
    }),
  );
  if (deploy.status === 'activating') {
    yield* Effect.sync(() => {
      void props.scheduleActivation(deploy.id).catch(() => undefined);
    });
  }
  const failure =
    deploy.failure === null
      ? null
      : yield* Schema.encode(ZerospinError.schema)(deploy.failure).pipe(
          mapParseError({
            code: 'system-deploy-status-invalid',
            prefix: 'Stored deploy failure is invalid',
            extra: { deployId: request.deployId },
          }),
        );
  return {
    activationCheckpoint: deploy.activationCheckpoint,
    clean: deploy.clean,
    deployId: deploy.id,
    failure,
    generationId: deploy.generationId,
    status: deploy.status,
    workerVersionId: deploy.workerVersionId,
  };
});
