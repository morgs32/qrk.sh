import '@zerospin/server-only';
import type { IAnyError } from '@zerospin/error';
import type { Effect, Schema } from 'effect';

import type { IDb, IResourceDbConfig } from '../drizzle/types.ts';
import type { IModels } from '../models/types.ts';

import type { IServiceQuery } from './types.ts';

export function makeServiceQuery<
  NAME extends string,
  SERVICE extends { name: string; models: IModels },
  PARAMS_SCHEMA extends Schema.Schema.AnyNoContext,
  RESULT,
>(props: {
  name: NAME;
  serviceController: SERVICE;
  paramsSchema: PARAMS_SCHEMA;
  query: (props: {
    db: IDb<IResourceDbConfig<SERVICE['models']>>;
    params: Schema.Schema.Type<PARAMS_SCHEMA>;
  }) => Effect.Effect<RESULT, IAnyError>;
}): IServiceQuery<NAME, SERVICE['models'], PARAMS_SCHEMA, RESULT> {
  const { name, serviceController, paramsSchema, query } = props;

  return {
    kind: 'service',
    name,
    serviceName: serviceController.name,
    paramsSchema,
    query,
  };
}
