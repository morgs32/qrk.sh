import type { IAnyError } from '@zerospin/error';
import '@zerospin/server-only';
import { Layer, ManagedRuntime, Schema, type Effect } from 'effect';
import { isEqual, mapValues } from 'es-toolkit';

import { assertAgentContract } from '../../../agent/makeAgentContract.ts';
import { isAgentCapturedSelection } from '../../../agent/makeAgentSessionDefinition.ts';
import type { IAgentSessionDefinition } from '../../../agent/types.ts';
import type {
  IAggregate,
  IAnyAuthoredAggregate,
} from '../../../aggregate/types.ts';
import { getAggregateActorVersion } from '../../../aggregateActor/getAggregateActorVersion.ts';
import { sessionRepoDbConfig } from '../../../aggregateSession/sessionRepoDbConfig.ts';
import { AsyncLive } from '../../../async/AsyncLive.ts';
import { publicContracts } from '../../../contracts/externalContract.ts';
import type { IContract } from '../../../contracts/types.ts';
import { captureActorSelections } from '../../../models/make/makeActorDbVersion.ts';
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
          readonly external: {
            readonly request: infer P extends (
              ...args: never[]
            ) => Effect.Effect<unknown, unknown, unknown>;
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
    agents?: Readonly<
      Record<string, { readonly definition: IAgentSessionDefinition }>
    >;
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
  agents?: Readonly<
    Record<string, { readonly definition: IAgentSessionDefinition }>
  >;
  layer?: Layer.Any;
  aggregates: Record<string, Readonly<Record<string, IAnyAuthoredAggregate>>>;
  services?: Record<string, Readonly<Record<string, IAnyService>>>;
}): unknown {
  const {
    layer = Layer.empty,
    name,
    agents: agentSessions,
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
  const agents = mapValues(agentSessions, session => session.definition);
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
      authoredAggregates[agent.aggregateName]?.[agent.aggregateVersion];
    if (aggregate === undefined || agent.systemName !== name) {
      throw new Error(
        `Agent ${agentName} aggregate is not registered at its exact version`,
      );
    }
    const actor = getAggregateActorVersion(
      { [aggregate.version]: aggregate },
      { actorName: agent.actorName, actorVersion: agent.actorVersion },
    );
    if (
      actor.authentication !== 'system' ||
      actor.identity.pattern.source !== '/' ||
      Object.keys(actor.identity.claimsSchema.fields).some(
        field => field !== 'aggregateId',
      )
    ) {
      throw new Error(
        `Agent ${agentName} requires a system-only actor with aggregate-only identity`,
      );
    }
    if (
      !isEqual(
        Schema.toJsonSchemaDocument(actor.identity.claimsSchema),
        Schema.toJsonSchemaDocument(agent.claimsSchema),
      )
    ) {
      throw new Error(
        `Agent ${agentName} claims differ from the registered actor`,
      );
    }
    if (
      Object.keys(agent.models).length !==
        Object.keys(aggregate.models).length ||
      Object.keys(agent.db.models).length !==
        Object.keys(aggregate.models).length ||
      Object.keys(actor.db.models).length !==
        Object.keys(aggregate.models).length
    ) {
      throw new Error(
        `Agent ${agentName} requires every aggregate domain model`,
      );
    }
    for (const [modelName, model] of Object.entries(aggregate.models)) {
      if (Object.hasOwn(sessionRepoDbConfig.schema, modelName)) {
        throw new Error(
          `Agent ${agentName} uses reserved session model ${modelName}`,
        );
      }
      if (
        agent.models[modelName] !== model ||
        agent.db.models[modelName] !== model ||
        actor.db.models[modelName] !== model
      ) {
        throw new Error(
          `Agent ${agentName} model ${modelName} is not the canonical aggregate model`,
        );
      }
      const selected = actor.selections[modelName];
      if (selected === undefined || !selected.selectsAllRows()) {
        throw new Error(
          `Agent ${agentName} requires full-row actor selection for ${modelName}`,
        );
      }
    }
    const permitted = publicContracts(actor.contracts);
    for (const [contractName, contract] of Object.entries(agent.contracts)) {
      if (
        contract.external !== undefined ||
        contract.mapping !== undefined ||
        permitted[contractName] !== contract
      ) {
        throw new Error(
          `Agent ${agentName} contract ${contractName} is not the actor's exact ordinary contract`,
        );
      }
    }
    const capturedSelections = captureActorSelections(
      agent.db,
      agent.selections,
      agent.claimsSchema,
    );
    if (
      Object.keys(capturedSelections).length !==
        Object.keys(agent.capturedSelections).length ||
      Object.keys(agent.contracts).length !==
        Object.keys(agent.contractBindings).length
    ) {
      throw new Error(
        `Agent ${agentName} declarations do not match their normalized metadata`,
      );
    }
    for (const [selectionName, selected] of Object.entries(
      capturedSelections,
    )) {
      const captured = agent.capturedSelections[selectionName];
      if (
        !isAgentCapturedSelection(captured) ||
        captured.models !== agent.db.models ||
        captured.model !== aggregate.models[selectionName] ||
        !isEqual(captured.query, selected.query)
      ) {
        throw new Error(
          `Agent ${agentName} selection ${selectionName} is not its canonical model selection`,
        );
      }
    }
    for (const [contractName, binding] of Object.entries(
      agent.contractBindings,
    )) {
      const contractVersion = agent.contracts[contractName];
      if (contractVersion === undefined) {
        throw new Error(
          `Agent ${agentName} binding ${contractName} has no ordinary contract`,
        );
      }
      assertAgentContract({
        contractVersion,
        model: binding.model,
        bind: binding.bind,
      });
      if (
        agent.models[binding.model.modelName] !== binding.model ||
        agent.capturedSelections[binding.model.modelName]?.model !==
          binding.model
      ) {
        throw new Error(
          `Agent ${agentName} binding ${contractName} must use its exact selected model`,
        );
      }
    }
  }
  return system;
}
