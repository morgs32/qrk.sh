import type { IDb } from '@zerospin/core/drizzle/types';
import { EncodedResourceSchema } from '@zerospin/core/models/EncodedResourceSchema';
import type { IServiceFrontendState } from '@zerospin/core/serviceSession/types';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { mapParseError, ZerospinError, type IAnyError } from '@zerospin/error';
import { makeAbbreviationIdSchema } from '@zerospin/schema';
import { eq } from 'drizzle-orm';
import { Effect, Schema } from 'effect';
import { system } from 'system';

import { materializedServiceFrontendRepoDrizzleSchemas } from '../MaterializedServiceFrontendRepoDbConfig.js';

export const getState = Effect.fn('MaterializedServiceFrontendRepo.getState')(
  function* (props: {
    db: IDb;
    key: {
      systemId: string;
      serviceName: string;
      userId: string;
      frontendName: string;
    };
    requested: {
      systemId: string;
      serviceName: string;
      userId: string;
      frontendName: string;
    };
  }): Effect.fn.Return<IServiceFrontendState, IAnyError> {
    const { db, key, requested } = props;
    if (
      requested.systemId !== key.systemId ||
      requested.serviceName !== key.serviceName ||
      requested.userId !== key.userId ||
      requested.frontendName !== key.frontendName
    ) {
      return yield* new ZerospinError({
        code: 'materialized-service-frontend-target-mismatch',
        message: 'Requested state does not match the bound frontend target',
      });
    }
    const service = system.services[key.serviceName];
    const frontendBinding = service?.frontends[key.frontendName];
    if (service === undefined || frontendBinding === undefined) {
      return yield* new ZerospinError({
        code: 'materialized-service-frontend-definition-missing',
        message: `Service frontend ${key.serviceName}.${key.frontendName} is not defined`,
      });
    }
    const systemId = yield* Schema.decodeUnknownEffect(
      makeAbbreviationIdSchema(coreAbbreviations.system),
    )(key.systemId).pipe(
      mapParseError({
        code: 'materialized-service-frontend-system-id-invalid',
        prefix: 'Failed to decode the bound systemId',
      }),
    );
    const state = db
      .select()
      .from(materializedServiceFrontendRepoDrizzleSchemas.materializationState)
      .where(
        eq(
          materializedServiceFrontendRepoDrizzleSchemas.materializationState.id,
          1,
        ),
      )
      .get();
    const resources: IServiceFrontendState['resources'][number][] = [];
    for (const model of Object.values(frontendBinding.controller.models)) {
      for (const row of db.select().from(model.drizzleSchema).all()) {
        resources.push(
          yield* Schema.decodeUnknownEffect(
            Schema.toType(EncodedResourceSchema),
          )(row).pipe(
            mapParseError({
              code: 'materialized-service-frontend-state-resource-invalid',
              prefix: `Failed to decode frontend resource ${model.modelName}`,
            }),
          ),
        );
      }
    }
    return {
      userId: key.userId,
      systemId,
      systemVersion: system.version,
      serviceName: key.serviceName,
      frontendName: key.frontendName,
      serviceIndex: state?.serviceIndex ?? 0,
      serviceFrontendIndex: state?.serviceFrontendIndex ?? 0,
      resources,
    };
  },
);
