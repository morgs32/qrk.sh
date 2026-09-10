import '@zerospin/server-only';
import type { IAnyError } from '@zerospin/error';
import type { CuidFactory, ITypeError } from '@zerospin/schema';
import { Layer, Schema, type Effect, type Scope } from 'effect';
import { mapValues } from 'es-toolkit';

import type {
  IAggregate,
  IAggregateAuthorization,
  IAnyAuthoredAggregate,
} from '../aggregate/types.ts';
import type { Async } from '../async/Async.ts';
import type { IAuthentication } from '../authentication/types.ts';
import type { IModel } from '../models/types.ts';
import type { IAnyServices } from '../service/types.ts';
import type { MonotonicFactory } from '../services/MonotonicFactory.ts';

import { decodeSystemProps } from './decodeSystemProps.ts';
import { resolveSystemAggregate } from './resolveSystemAggregate.ts';
import { resolveSystemService } from './resolveSystemService.ts';
import type { ISystem, ISystemConfig } from './types.ts';
import { ZerospinConfigSchema } from './ZerospinConfigSchema.ts';

type IResolvedAggregates<
  AGGREGATES extends Record<string, readonly IAnyAuthoredAggregate[]>,
> = {
  readonly [NAME in keyof AGGREGATES & string]: {
    readonly [DEFINITION in AGGREGATES[NAME][number] as DEFINITION['version']]: IAggregate<
      NAME,
      DEFINITION['models'],
      DEFINITION['contracts'],
      DEFINITION['selections'],
      NonNullable<DEFINITION['authorize']> &
        IAggregateAuthorization<DEFINITION['models'], never>,
      DEFINITION['version'],
      Layer.Success<DEFINITION['layer']>,
      Layer.Services<DEFINITION['layer']>
    >;
  };
};

export function makeSystem<
  SYSTEM_NAME extends string,
  const AUTHENTICATION extends readonly IAuthentication[],
  const AGGREGATES extends Record<string, readonly IAnyAuthoredAggregate[]>,
  APP_SERVICES,
  const SERVICES extends Record<string, readonly IAnyServices[string][]> = {},
>(props: {
  name: SYSTEM_NAME;
  layer: Layer.Layer<APP_SERVICES, IAnyError>;
  authentication: AUTHENTICATION;
  aggregates: AGGREGATES & {
    [AGGREGATE_NAME in keyof NoInfer<AGGREGATES> & string]: {
      [INDEX in keyof AGGREGATES[AGGREGATE_NAME]]: AGGREGATES[AGGREGATE_NAME][INDEX] extends infer DEFINITION extends
        IAnyAuthoredAggregate
        ? { name: AGGREGATE_NAME } & ([
            Exclude<
              Effect.Services<DEFINITION['initializeGuards']>,
              | NoInfer<APP_SERVICES>
              | CuidFactory
              | MonotonicFactory
              | Async
              | Scope.Scope
            >,
          ] extends [never]
            ? unknown
            : ITypeError<'System layer must supply aggregate guard and layer requirements'>)
        : AGGREGATES[AGGREGATE_NAME][INDEX];
    };
  };
  services?: SERVICES & {
    [SERVICE_NAME in keyof NoInfer<SERVICES> & string]: {
      [INDEX in keyof SERVICES[SERVICE_NAME]]: SERVICES[SERVICE_NAME][INDEX] extends infer DEFINITION extends
        IAnyServices[string]
        ? { name: SERVICE_NAME } & ([
            Exclude<
              Effect.Services<DEFINITION['initializeGuards']>,
              | NoInfer<APP_SERVICES>
              | CuidFactory
              | MonotonicFactory
              | Async
              | Scope.Scope
            >,
          ] extends [never]
            ? unknown
            : ITypeError<'System layer must supply service guard and layer requirements'>)
        : SERVICES[SERVICE_NAME][INDEX];
    };
  };
}): ISystem<
  IResolvedAggregates<AGGREGATES>,
  {
    [NAME in keyof SERVICES]: {
      [DEFINITION in SERVICES[NAME][number] as DEFINITION['version']]: DEFINITION;
    };
  },
  SYSTEM_NAME,
  AUTHENTICATION,
  APP_SERVICES
>;

export function makeSystem<
  SYSTEM_NAME extends string,
  const AUTHENTICATION extends readonly IAuthentication[],
  const AGGREGATES extends Record<string, readonly IAnyAuthoredAggregate[]>,
  const SERVICES extends Record<string, readonly IAnyServices[string][]> = {},
>(props: {
  name: SYSTEM_NAME;
  layer?: never;
  authentication: AUTHENTICATION;
  aggregates: AGGREGATES & {
    [AGGREGATE_NAME in keyof NoInfer<AGGREGATES> & string]: {
      [INDEX in keyof AGGREGATES[AGGREGATE_NAME]]: AGGREGATES[AGGREGATE_NAME][INDEX] extends infer DEFINITION extends
        IAnyAuthoredAggregate
        ? { name: AGGREGATE_NAME } & ([
            Exclude<
              Effect.Services<DEFINITION['initializeGuards']>,
              CuidFactory | MonotonicFactory | Async | Scope.Scope
            >,
          ] extends [never]
            ? unknown
            : ITypeError<'System layer must supply aggregate guard and layer requirements'>)
        : AGGREGATES[AGGREGATE_NAME][INDEX];
    };
  };
  services?: SERVICES & {
    [SERVICE_NAME in keyof NoInfer<SERVICES> & string]: {
      [INDEX in keyof SERVICES[SERVICE_NAME]]: SERVICES[SERVICE_NAME][INDEX] extends infer DEFINITION extends
        IAnyServices[string]
        ? { name: SERVICE_NAME } & ([
            Exclude<
              Effect.Services<DEFINITION['initializeGuards']>,
              CuidFactory | MonotonicFactory | Async | Scope.Scope
            >,
          ] extends [never]
            ? unknown
            : ITypeError<'System layer must supply service guard and layer requirements'>)
        : SERVICES[SERVICE_NAME][INDEX];
    };
  };
}): ISystem<
  IResolvedAggregates<AGGREGATES>,
  {
    [NAME in keyof SERVICES]: {
      [DEFINITION in SERVICES[NAME][number] as DEFINITION['version']]: DEFINITION;
    };
  },
  SYSTEM_NAME,
  AUTHENTICATION,
  never
>;

export function makeSystem(props: {
  name: string;
  layer?: Layer.Any;
  authentication: readonly IAuthentication[];
  aggregates: Record<string, readonly IAnyAuthoredAggregate[]>;
  services?: Record<string, readonly IAnyServices[string][]>;
}): unknown {
  const decoded = decodeSystemProps(props);
  const serviceNameBySourceModel = new Map<IModel, string>();
  const services = mapValues(decoded.services, (definitions, serviceKey) => {
    if (
      new Set(definitions.map(definition => definition.version)).size !==
      definitions.length
    ) {
      throw new Error(`Duplicate service version for ${serviceKey}`);
    }
    return Object.fromEntries(
      definitions.map(service => [
        service.version,
        resolveSystemService({
          name: decoded.name,
          serviceName: String(serviceKey),
          service,
          serviceNameBySourceModel,
        }),
      ]),
    );
  });
  const aggregates = mapValues(
    decoded.aggregates,
    (definitions, aggregateKey) => {
      if (
        new Set(definitions.map(definition => definition.version)).size !==
        definitions.length
      ) {
        throw new Error(`Duplicate aggregate version for ${aggregateKey}`);
      }
      return Object.fromEntries(
        definitions.map(aggregate => [
          aggregate.version,
          resolveSystemAggregate({
            name: decoded.name,
            aggregateName: String(aggregateKey),
            aggregate,
            services,
            serviceNameBySourceModel,
          }),
        ]),
      );
    },
  );
  const system = {
    config(): ISystemConfig<unknown> {
      const config = { system };
      Schema.decodeUnknownSync(ZerospinConfigSchema)(config);
      return config;
    },
    layer: props.layer ?? Layer.empty,
    name: decoded.name,
    authentication: decoded.authentication,
    aggregates,
    services,
  };

  return system;
}
