import type { IAnyError } from '@zerospin/error';
import { PrimitiveKind } from '@zerospin/schema';
import '@zerospin/server-only';
import { Layer, ManagedRuntime, type Effect } from 'effect';
import { mapValues } from 'es-toolkit';

import type { IAgent } from '../../../agent/makeAgent.ts';
import type {
  IAggregate,
  IAnyAuthoredAggregate,
} from '../../../aggregate/types.ts';
import { getAggregateActorVersion } from '../../../aggregateActor/getAggregateActorVersion.ts';
import { AsyncLive } from '../../../async/AsyncLive.ts';
import type { IContract } from '../../../contracts/types.ts';
import type { IModel } from '../../../models/types.ts';
import type { IAnyService } from '../../../service/types.ts';
import { getServiceActorVersion } from '../../../serviceActor/getServiceActorVersion.ts';
import { ErrorLayer } from '../../../utils/ErrorLayer.ts';
import { NanoIdFactory } from '../../../utils/NanoIdFactory.ts';
import { UlidMonotonicFactory } from '../../../utils/UlidMonotonicFactory.ts';
import type { ISystem } from '../../types.ts';

import { decodeSystemProps } from './decodeSystemProps/decodeSystemProps.ts';
import { resolveSystemAggregate } from './resolveSystemAggregate/resolveSystemAggregate.ts';
import { resolveSystemService } from './resolveSystemService/resolveSystemService.ts';
type IResolvedAggregates<
  AGGREGATES extends Record<
    string,
    Readonly<Record<string, IAnyAuthoredAggregate>>
  >,
> = {
  readonly [NAME in keyof AGGREGATES & string]: {
    readonly [VERSION in keyof AGGREGATES[NAME] & string]: IAggregate<
      NAME,
      AGGREGATES[NAME][VERSION]['models'],
      AGGREGATES[NAME][VERSION]['actors'],
      VERSION,
      NonNullable<AGGREGATES[NAME][VERSION]['__guardRequirements']>
    >;
  };
};
type IResolvedServices<
  SERVICES extends Record<string, Readonly<Record<string, IAnyService>>>,
> = SERVICES;
type RequiredServices<REQUIREMENTS> = [{}] extends [REQUIREMENTS]
  ? never
  : REQUIREMENTS;
type IExternalOwner = {
  actors: Readonly<
    Record<
      string,
      {
        contracts: Readonly<Record<string, IContract>>;
      }
    >
  >;
};
type ExternalRequirements<
  OWNERS extends Readonly<
    Record<string, Readonly<Record<string, IExternalOwner>>>
  >,
> = {
  [N in keyof OWNERS]: {
    [V in keyof OWNERS[N]]: {
      [A in keyof OWNERS[N][V]['actors']]: {
        [C in keyof OWNERS[N][V]['actors'][A]['contracts']]: OWNERS[N][V]['actors'][A]['contracts'][C] extends {
          readonly async: {
            readonly external: {
              readonly program: infer P extends (
                ...args: never[]
              ) => Effect.Effect<unknown, unknown, unknown>;
            };
          };
        }
          ? Effect.Services<ReturnType<P>>
          : never;
      }[keyof OWNERS[N][V]['actors'][A]['contracts']];
    }[keyof OWNERS[N][V]['actors']];
  }[keyof OWNERS[N]];
}[keyof OWNERS];
type SystemRequirements<
  AGGREGATES extends Record<
    string,
    Readonly<Record<string, IAnyAuthoredAggregate>>
  >,
> = {
  [NAME in keyof AGGREGATES]: {
    [VERSION in keyof AGGREGATES[NAME]]: RequiredServices<
      NonNullable<AGGREGATES[NAME][VERSION]['__guardRequirements']>
    >;
  }[keyof AGGREGATES[NAME]];
}[keyof AGGREGATES];
export function makeSystem<
  SYSTEM_NAME extends string,
  const AGGREGATES extends Record<
    string,
    Readonly<Record<string, IAnyAuthoredAggregate>>
  >,
  APP_SERVICES = never,
  const SERVICES extends Record<string, Readonly<Record<string, IAnyService>>> =
    {},
>(
  props: {
    name: SYSTEM_NAME;
    agents?: Readonly<Record<string, IAgent>>;
    aggregates: AGGREGATES & {
      [NAME in keyof NoInfer<AGGREGATES> & string]: {
        [VERSION in keyof AGGREGATES[NAME] & string]: {
          name: NAME;
          version: VERSION;
        };
      };
    };
    services?: SERVICES & {
      [NAME in keyof NoInfer<SERVICES> & string]: {
        [VERSION in keyof SERVICES[NAME] & string]: {
          name: NAME;
          version: VERSION;
        };
      };
    };
  } & ([
    | SystemRequirements<AGGREGATES>
    | ExternalRequirements<AGGREGATES>
    | ExternalRequirements<SERVICES>,
  ] extends [never]
    ? {
        layer?: Layer.Layer<APP_SERVICES, IAnyError>;
      }
    : {
        layer: Layer.Layer<
          | APP_SERVICES
          | SystemRequirements<AGGREGATES>
          | ExternalRequirements<AGGREGATES>
          | ExternalRequirements<SERVICES>,
          IAnyError
        >;
      }),
): ISystem<
  IResolvedAggregates<AGGREGATES>,
  IResolvedServices<SERVICES>,
  SYSTEM_NAME
>;
export function makeSystem(props: {
  name: string;
  agents?: Readonly<Record<string, IAgent>>;
  layer?: Layer.Any;
  aggregates: Record<string, Readonly<Record<string, IAnyAuthoredAggregate>>>;
  services?: Record<string, Readonly<Record<string, IAnyService>>>;
}): unknown {
  const {
    layer = Layer.empty,
    name,
    agents,
    aggregates: authoredAggregates,
    services: authoredServices,
  } = decodeSystemProps(props);
  const runtime = ManagedRuntime.make(
    Layer.mergeAll(
      NanoIdFactory,
      UlidMonotonicFactory,
      ErrorLayer,
      AsyncLive,
      layer,
    ),
  );
  const serviceNameBySourceModel = new Map<IModel, string>();
  const services = mapValues(authoredServices, (definitions, serviceKey) => {
    for (const [version, service] of Object.entries(definitions)) {
      if (service.name !== serviceKey) {
        throw new Error(
          `Service key ${serviceKey} does not match ${service.name}`,
        );
      }
      if (version !== service.version) {
        throw new Error(
          `Service version key ${version} does not match ${serviceKey} version ${service.version}`,
        );
      }
      for (const actor of Object.values(service.actors)) {
        getServiceActorVersion(definitions, {
          actorName: actor.name,
          actorVersion: actor.version,
        });
      }
    }
    return mapValues(definitions, service =>
      resolveSystemService({
        name,
        serviceName: String(serviceKey),
        service,
        serviceNameBySourceModel,
      }),
    );
  });
  const aggregates = mapValues(
    authoredAggregates,
    (definitions, aggregateKey) =>
      mapValues(definitions, (aggregate, version) => {
        if (version !== aggregate.version) {
          throw new Error(
            `Aggregate version key ${version} does not match ${aggregateKey} version ${aggregate.version}`,
          );
        }
        return resolveSystemAggregate({
          name,
          aggregateName: String(aggregateKey),
          aggregate,
        });
      }),
  );
  const system = {
    agents,
    runtime,
    name,
    aggregates,
    services,
  };
  for (const versions of Object.values(aggregates)) {
    for (const aggregate of Object.values(versions)) {
      for (const actor of Object.values(aggregate.actors)) {
        getAggregateActorVersion(versions, {
          actorName: actor.name,
          actorVersion: actor.version,
        });
      }
    }
  }
  for (const [agentName, agent] of Object.entries(agents)) {
    const aggregate =
      authoredAggregates[agent.aggregate.name]?.[agent.aggregate.version];
    if (aggregate !== agent.aggregate) {
      throw new Error(
        `Agent ${agentName} aggregate is not registered at its exact version`,
      );
    }
    const actor = getAggregateActorVersion(
      { [aggregate.version]: aggregate },
      { actorName: agent.actor.name, actorVersion: agent.actor.version },
    );
    if (actor !== agent.actor) {
      throw new Error(
        `Agent ${agentName} actor is not registered at its exact version`,
      );
    }
    if (
      actor.authentication !== 'system' ||
      Object.keys(actor.contracts).length !== 0 ||
      actor.identity.pattern.source !== '/' ||
      Object.keys(actor.identity.claimsSchema.fields).some(
        field => field !== 'aggregateId',
      )
    ) {
      throw new Error(
        `Agent ${agentName} requires a system-only, command-free actor with aggregate-only identity`,
      );
    }
    if (Object.hasOwn(actor.db.models, '_agentCheckpoint')) {
      throw new Error(`Agent ${agentName} uses a reserved model name`);
    }
    const model = actor.db.models[agent.query.modelName];
    if (model === undefined) {
      throw new Error(
        `Agent ${agentName} query model is outside the actor projection`,
      );
    }
    for (const field of Object.keys(agent.query.where ?? {})) {
      const descriptor = model.spec.propertiesShape[field];
      if (
        !Object.hasOwn(model.spec.propertiesShape, field) ||
        descriptor === undefined
      ) {
        throw new Error(
          `Agent ${agentName} query field ${field} is outside the model`,
        );
      }
      for (const [operator, value] of Object.entries(
        agent.query.where?.[field] ?? {},
      )) {
        if (operator === 'isNull' || operator === 'isNotNull') continue;
        const valid =
          descriptor.kind === PrimitiveKind.Date
            ? typeof value === 'string' && !Number.isNaN(Date.parse(value))
            : descriptor.kind === PrimitiveKind.Integer ||
                descriptor.kind === PrimitiveKind.Number ||
                (descriptor.kind === PrimitiveKind.Ref &&
                  descriptor.targetKind === PrimitiveKind.Integer)
              ? typeof value === 'number'
              : descriptor.kind === PrimitiveKind.Boolean
                ? typeof value === 'boolean' &&
                  (operator === 'eq' || operator === 'ne')
                : typeof value === 'string';
        if (!valid) {
          throw new Error(
            `Agent ${agentName} query has an invalid literal for ${field}.${operator}`,
          );
        }
      }
    }
  }
  return system;
}
