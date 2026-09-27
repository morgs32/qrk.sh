import path from 'node:path';

import type {
  ISystemConfig,
  ISystemEnvironmentId,
} from '@zerospin/core/system/types';
import { makeZerospinError } from '@zerospin/error';

/** Framework-owned backend configuration shared by CLI and workerd tests. */
export function makeWranglerConfig(props: {
  config: ISystemConfig;
  main: string;
  configModulePath: string;
  environment: ISystemEnvironmentId;
}) {
  const name = `zerospin-${props.config.system.name}`;
  if (!/^[a-z][a-z0-9_-]*$/.test(name) || name.length > 63) {
    throw makeZerospinError({
      code: 'zerospin-worker-name-invalid',
      message: `System name ${JSON.stringify(props.config.system.name)} produces an invalid Worker name: ${name}.`,
    });
  }
  const bindings = [
    { name: 'SYSTEM_REPO', class_name: 'SystemRepo' },
    { name: 'AGGREGATE_VERSION_REPO', class_name: 'AggregateVersionRepo' },
    { name: 'SERVICE_VERSION_REPO', class_name: 'ServiceVersionRepo' },
    { name: 'AGGREGATE_CHAIN', class_name: 'AggregateChain' },
    {
      name: 'AGGREGATE_VERSION_CHAIN',
      class_name: 'AggregateVersionChain',
    },
    { name: 'SERVICE_VERSION_CHAIN', class_name: 'ServiceVersionChain' },
    {
      name: 'AGGREGATE_ACTOR_VERSION_REPO',
      class_name: 'AggregateActorVersionRepo',
    },
    {
      name: 'AGGREGATE_ACTOR_VERSION_CHAIN',
      class_name: 'AggregateActorVersionChain',
    },
    { name: 'SERVICE_CHAIN', class_name: 'ServiceChain' },
    {
      name: 'SERVICE_ACTOR_VERSION_REPO',
      class_name: 'ServiceActorVersionRepo',
    },
    {
      name: 'SERVICE_ACTOR_VERSION_CHAIN',
      class_name: 'ServiceActorVersionChain',
    },
    { name: 'SYSTEM_LOG_REPO', class_name: 'SystemLogRepo' },
    { name: 'SYSTEM_LOG_AGENT', class_name: 'SystemLogAgent' },
  ];
  return {
    name,
    main: path.resolve(props.main),
    compatibility_date: '2026-01-20',
    compatibility_flags: ['nodejs_compat'],
    alias: { config: path.resolve(props.configModulePath) },
    durable_objects: { bindings },
    exports: Object.fromEntries(
      bindings.map(binding => [
        binding.class_name,
        { type: 'durable-object', storage: 'sqlite' },
      ]),
    ),
    ...(props.environment === 'production'
      ? { version_metadata: { binding: 'ZEROSPIN_VERSION_METADATA' } }
      : {}),
    observability: {
      enabled: false,
      head_sampling_rate: 1,
      logs: { enabled: true, head_sampling_rate: 1, invocation_logs: true },
      traces: { enabled: true, head_sampling_rate: 1 },
    },
    vars: {
      ZEROSPIN_ENVIRONMENT: props.environment,
      ZEROSPIN_SYSTEM_ID: props.config.systemId,
    },
  };
}
