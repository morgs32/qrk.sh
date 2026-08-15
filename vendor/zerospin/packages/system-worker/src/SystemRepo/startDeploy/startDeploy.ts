import { makeAsync } from '@zerospin/core/async/makeAsync';
import type { IAnyDrizzleSchema } from '@zerospin/core/models/types';
import { ZerospinError } from '@zerospin/error';
import type { AnyColumn } from 'drizzle-orm';
import { Effect, ParseResult, Schema } from 'effect';

import { allocateDeploy } from '../allocateDeploy/allocateDeploy.js';
import { getDeploy } from '../getDeploy/getDeploy.js';

export const startDeploy = Effect.fn('SystemRepo.startDeploy')(
  function* (props: {
    db: Parameters<typeof allocateDeploy>[0]['db'];
    request: { clean: boolean };
    readiness: Promise<void>;
    environment: 'dev' | 'production';
    workerVersionId: string;
    systemSpec: Parameters<typeof allocateDeploy>[0]['systemSpec'];
    scheduleActivation: (deployId: string) => Promise<void>;
    selectionTable: IAnyDrizzleSchema;
    selectionColumns: Readonly<{
      id: AnyColumn;
      activeDeployId: AnyColumn;
      activatingDeployId: AnyColumn;
      lastCleanRequestId: AnyColumn;
    }>;
    deployTable: IAnyDrizzleSchema;
    deployColumns: Readonly<{
      id: AnyColumn;
      workerVersionId: AnyColumn;
      clean: AnyColumn;
      status: AnyColumn;
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
        clean: Schema.Boolean,
      }),
    )(props.request, { onExcessProperty: 'error' }).pipe(
      Effect.mapError(
        error =>
          new ZerospinError({
            code: 'system-deploy-start-invalid',
            message: `Deploy start is invalid: ${ParseResult.TreeFormatter.formatErrorSync(error)}`,
            status: 400,
          }),
      ),
    );
    const allocation = yield* allocateDeploy({
      db: props.db,
      workerVersionId: props.workerVersionId,
      clean: request.clean,
      cleanRequestId: null,
      systemSpec: props.systemSpec,
      selectionTable: props.selectionTable,
      selectionColumns: props.selectionColumns,
      deployTable: props.deployTable,
      deployColumns: props.deployColumns,
    });
    return yield* getDeploy({
      db: props.db,
      request: { deployId: allocation.deployId },
      readiness: props.readiness,
      environment: props.environment,
      scheduleActivation: props.scheduleActivation,
      deployTable: props.deployTable,
      deployColumns: props.deployColumns,
    });
  },
);
