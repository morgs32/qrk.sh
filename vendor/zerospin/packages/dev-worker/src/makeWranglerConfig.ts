import path from 'node:path';

import type {
  ISystemConfig,
  ISystemEnvironmentId,
} from '@zerospin/core/system/types';
import { ZerospinError } from '@zerospin/error';

/** Framework-owned backend configuration shared by CLI and workerd tests. */
export function makeWranglerConfig(props: {
  config: ISystemConfig;
  main: string;
  systemModulePath: string;
  environment: ISystemEnvironmentId;
}) {
  const name = `zerospin-${props.config.system.name}`;
  if (!/^[a-z][a-z0-9_-]*$/.test(name) || name.length > 63) {
    throw new ZerospinError({
      code: 'zerospin-worker-name-invalid',
      message: `System name ${JSON.stringify(props.config.system.name)} produces an invalid Worker name: ${name}.`,
    });
  }
  const bindings = [
    { name: 'SYSTEM_REPO', class_name: 'SystemRepo' },
    { name: 'VERSIONED_AGGREGATE_REPO', class_name: 'VersionedAggregateRepo' },
    { name: 'VERSIONED_SERVICE_REPO', class_name: 'VersionedServiceRepo' },
    { name: 'AGGREGATE_CHAIN', class_name: 'AggregateChain' },
    {
      name: 'VERSIONED_AGGREGATE_CHAIN',
      class_name: 'VersionedAggregateChain',
    },
    { name: 'VERSIONED_SERVICE_CHAIN', class_name: 'VersionedServiceChain' },
    {
      name: 'USER_VERSIONED_AGGREGATE_REPO',
      class_name: 'UserVersionedAggregateRepo',
    },
    {
      name: 'USER_VERSIONED_AGGREGATE_CHAIN',
      class_name: 'UserVersionedAggregateChain',
    },
    { name: 'SERVICE_ADMITTED_CHAIN', class_name: 'ServiceAdmittedChain' },
    {
      name: 'FRONTEND_VERSIONED_SERVICE_REPO',
      class_name: 'FrontendVersionedServiceRepo',
    },
    { name: 'FRONTEND_SERVICE_CHAIN', class_name: 'FrontendServiceChain' },
    { name: 'SYSTEM_LOG_REPO', class_name: 'SystemLogRepo' },
    { name: 'SYSTEM_LOG_AGENT', class_name: 'SystemLogAgent' },
  ];
  return {
    name,
    main: path.resolve(props.main),
    compatibility_date: '2026-01-20',
    compatibility_flags: ['nodejs_compat'],
    alias: { system: path.resolve(props.systemModulePath) },
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
