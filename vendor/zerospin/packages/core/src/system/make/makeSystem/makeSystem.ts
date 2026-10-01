import type { IAnyError } from '@zerospin/error';
import '@zerospin/server-only';
import { Layer, ManagedRuntime, type Effect } from 'effect';
import { mapValues } from 'es-toolkit';

import type {
  IAggregate,
  IAnyAuthoredAggregate,
} from '../../../aggregate/types.ts';
import { getAggregateActorVersion } from '../../../aggregateActor/getAggregateActorVersion.ts';
import { AsyncLive } from '../../../async/AsyncLive.ts';
import type { IAnyMachineDeclaration } from '../../../machine/types.ts';
import type { IModel } from '../../../models/types.ts';
import type {
  IAnyService,
  IAnyVersionedService,
} from '../../../service/types.ts';
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

type IResolvedServices<SERVICES extends Record<string, IAnyVersionedService>> =
  {
    readonly [NAME in keyof SERVICES]: SERVICES[NAME]['versions'];
  };

type RequiredServices<REQUIREMENTS> = [{}] extends [REQUIREMENTS]
  ? never
  : REQUIREMENTS;

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

type MachineRequirements<
  MACHINES extends Record<string, IAnyMachineDeclaration>,
> = {
  [NAME in keyof MACHINES]: {
    [STATE in keyof MACHINES[NAME]['routes']]: MACHINES[NAME]['routes'][STATE] extends {
      readonly onActivation: (
        ...args: never[]
      ) => Effect.Effect<unknown, unknown, infer SERVICES>;
    }
      ? SERVICES
      : never;
  }[keyof MACHINES[NAME]['routes']];
}[keyof MACHINES];

type ApplicationRequirements<
  AGGREGATES extends Record<
    string,
    Readonly<Record<string, IAnyAuthoredAggregate>>
  >,
  MACHINES extends Record<string, IAnyMachineDeclaration>,
> = SystemRequirements<AGGREGATES> | MachineRequirements<MACHINES>;

export function makeSystem<
  SYSTEM_NAME extends string,
  const AGGREGATES extends Record<
    string,
    Readonly<Record<string, IAnyAuthoredAggregate>>
  >,
  APP_SERVICES = never,
  const SERVICES extends Record<string, IAnyVersionedService> = {},
  const MACHINES extends Record<string, IAnyMachineDeclaration> = {},
>(
  props: {
    name: SYSTEM_NAME;
    aggregates: AGGREGATES & {
      [NAME in keyof NoInfer<AGGREGATES> & string]: {
        [VERSION in keyof AGGREGATES[NAME] & string]: {
          name: NAME;
          version: VERSION;
        };
      };
    };
    services?: SERVICES & {
      [NAME in keyof NoInfer<SERVICES> & string]: { name: NAME };
    };
    machines?: MACHINES;
  } & ([ApplicationRequirements<AGGREGATES, MACHINES>] extends [never]
    ? { layer?: Layer.Layer<APP_SERVICES, IAnyError> }
    : {
        layer: Layer.Layer<
          APP_SERVICES | ApplicationRequirements<AGGREGATES, MACHINES>,
          IAnyError
        >;
      }),
): ISystem<
  IResolvedAggregates<AGGREGATES>,
  IResolvedServices<SERVICES>,
  SYSTEM_NAME,
  MACHINES
>;

export function makeSystem(props: {
  name: string;
  layer?: Layer.Any;
  aggregates: Record<string, Readonly<Record<string, IAnyAuthoredAggregate>>>;
  services?: Record<string, IAnyVersionedService>;
  machines?: Record<string, IAnyMachineDeclaration>;
}): unknown {
  const {
    layer = Layer.empty,
    name,
    aggregates: authoredAggregates,
    services: authoredServices,
    machines,
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
  const services = mapValues(authoredServices, (definition, serviceKey) => {
    if (definition.name !== serviceKey) {
      throw new Error(
        `Service key ${serviceKey} does not match ${definition.name}`,
      );
    }
    const definitions: Readonly<Record<string, IAnyService>> =
      definition.versions;
    for (const [version, service] of Object.entries(definitions)) {
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
          services,
          serviceNameBySourceModel,
        });
      }),
  );
  const system = {
    runtime,
    name,
    aggregates,
    services,
    machines,
  };

  for (const [machineName, machine] of Object.entries(machines)) {
    const source = machine.source;
    const registered =
      'services' in source
        ? Object.values(authoredAggregates[source.name] ?? {}).includes(source)
        : Object.values(authoredServices[source.name]?.versions ?? {}).includes(
            source,
          );
    if (!registered) {
      throw new Error(
        `Machine ${machineName} source is not registered in this system`,
      );
    }
    for (const [selectionName, selection] of Object.entries(
      machine.selections,
    )) {
      if (!Object.values(source.models).includes(selection.model)) {
        throw new Error(
          `Machine ${machineName} selection ${selectionName} does not belong to its source`,
        );
      }
    }
    for (const [bindingName, binding] of Object.entries(machine.contracts)) {
      const target = binding.target;
      const targetRegistered =
        'services' in target
          ? Object.values(authoredAggregates[target.name] ?? {}).includes(
              target,
            )
          : Object.values(
              authoredServices[target.name]?.versions ?? {},
            ).includes(target);
      if (
        !targetRegistered ||
        !Object.values(target.contracts).includes(binding.contract)
      ) {
        throw new Error(
          `Machine ${machineName} contract ${bindingName} is not bound to a registered target`,
        );
      }
    }
  }

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
  return system;
}
