import { makeAsync } from '@zerospin/core/async/makeAsync';
import type { IDb } from '@zerospin/core/drizzle/types';
import type { IAnyDrizzleSchema } from '@zerospin/core/models/types';
import { mapParseError, ZerospinError } from '@zerospin/error';
import { eq, type AnyColumn } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

export const getActiveGenerationId = Effect.fn(
  'SystemRepo.getActiveGenerationId',
)(function* (props: {
  db: IDb;
  readiness: Promise<void>;
  environment: 'dev' | 'production';
  productionDeployId: Promise<string | null>;
  scheduleActivation: (deployId: string) => Promise<void>;
  selectionTable: IAnyDrizzleSchema;
  selectionColumns: Readonly<{
    id: AnyColumn;
    activeDeployId: AnyColumn;
  }>;
  deployTable: IAnyDrizzleSchema;
  deployColumns: Readonly<{
    id: AnyColumn;
  }>;
}) {
  yield* makeAsync(() => props.readiness);
  const productionDeployId = yield* makeAsync(
    () => props.productionDeployId,
  ).pipe(Effect.catchAll(() => Effect.succeed(null)));
  let productionDeployRaw =
    props.environment === 'dev' || productionDeployId === null
      ? undefined
      : yield* Effect.try({
          try: () =>
            props.db
              .select()
              .from(props.deployTable)
              .where(eq(props.deployColumns.id, productionDeployId))
              .get(),
          catch: ZerospinError.catch({
            code: 'system-production-deploy-read-failed',
            message: 'Failed to read the Production deploy',
            status: 500,
          }),
        });
  let productionDeploy =
    productionDeployRaw === undefined
      ? null
      : yield* Schema.decodeUnknown(
          Schema.Struct({
            id: Schema.String,
            status: Schema.Literal('activating', 'succeeded', 'failed'),
            failure: Schema.NullOr(Schema.parseJson(ZerospinError.schema)),
          }),
        )(productionDeployRaw).pipe(
          mapParseError({
            code: 'system-production-deploy-invalid',
            prefix: 'Stored Production deploy is invalid',
          }),
        );
  if (
    props.environment === 'production' &&
    productionDeploy?.status === 'activating'
  ) {
    const activatingDeployId = productionDeploy.id;
    yield* makeAsync(() => props.scheduleActivation(activatingDeployId)).pipe(
      Effect.either,
    );
    productionDeployRaw = yield* Effect.try({
      try: () =>
        props.db
          .select()
          .from(props.deployTable)
          .where(eq(props.deployColumns.id, activatingDeployId))
          .get(),
      catch: ZerospinError.catch({
        code: 'system-production-deploy-read-failed',
        message: 'Failed to read the Production deploy after resume',
        status: 500,
      }),
    });
    productionDeploy =
      productionDeployRaw === undefined
        ? null
        : yield* Schema.decodeUnknown(
            Schema.Struct({
              id: Schema.String,
              status: Schema.Literal('activating', 'succeeded', 'failed'),
              failure: Schema.NullOr(Schema.parseJson(ZerospinError.schema)),
            }),
          )(productionDeployRaw).pipe(
            mapParseError({
              code: 'system-production-deploy-invalid',
              prefix: 'Stored resumed Production deploy is invalid',
            }),
          );
  }
  if (
    props.environment === 'production' &&
    (productionDeploy === null || productionDeploy.status === 'activating')
  ) {
    return yield* new ZerospinError({
      code: 'system-deploy-activating',
      message: 'The Production deploy is still activating',
      status: 503,
      extra: { deployId: productionDeploy?.id ?? null },
    });
  }
  if (productionDeploy?.status === 'failed') {
    const failure =
      productionDeploy.failure === null
        ? null
        : yield* Schema.encode(ZerospinError.schema)(
            productionDeploy.failure,
          ).pipe(
            mapParseError({
              code: 'system-production-deploy-invalid',
              prefix: 'Stored Production deploy failure is invalid',
            }),
          );
    return yield* new ZerospinError({
      code: 'system-deploy-failed',
      message: 'The Production deploy failed',
      status: 500,
      extra: { deployId: productionDeploy.id, failure },
    });
  }

  const rawSelection = yield* Effect.try({
    try: () =>
      props.db
        .select()
        .from(props.selectionTable)
        .where(eq(props.selectionColumns.id, 'sctl_system'))
        .get(),
    catch: ZerospinError.catch({
      code: 'system-selection-read-failed',
      message: 'Failed to read active SystemRepo selection',
      status: 500,
    }),
  });
  const selection =
    rawSelection === undefined
      ? null
      : yield* Schema.decodeUnknown(
          Schema.Struct({ activeDeployId: Schema.NullOr(Schema.String) }),
        )(rawSelection).pipe(
          mapParseError({
            code: 'system-selection-invalid',
            prefix: 'Stored active SystemRepo selection is invalid',
          }),
        );
  const rawActive =
    selection?.activeDeployId === null || selection === null
      ? undefined
      : yield* Effect.try({
          try: () =>
            props.db
              .select()
              .from(props.deployTable)
              .where(eq(props.deployColumns.id, selection.activeDeployId))
              .get(),
          catch: ZerospinError.catch({
            code: 'system-active-deploy-read-failed',
            message: 'Failed to read the active deploy',
            status: 500,
          }),
        });
  const active =
    rawActive === undefined
      ? null
      : yield* Schema.decodeUnknown(
          Schema.Struct({
            generationId: Schema.String,
            status: Schema.Literal('activating', 'succeeded', 'failed'),
          }),
        )(rawActive).pipe(
          mapParseError({
            code: 'system-active-deploy-invalid',
            prefix: 'Stored active deploy is invalid',
          }),
        );
  if (active === null || active.status !== 'succeeded') {
    return yield* new ZerospinError({
      code: 'system-not-ready',
      message: 'No readable System generation is active',
      status: 503,
    });
  }
  return active.generationId;
});
