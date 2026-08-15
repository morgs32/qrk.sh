import type { ISystemConfig, ISystemEnvironmentId } from './types.ts';

export function makeSystemConfig(props: {
  entry: string;
  supportedPredecessors: readonly string[];
  environmentId?: ISystemEnvironmentId;
  env?: Record<string, string>;
  retention?: ISystemConfig['retention'];
  seeds?: ISystemConfig['seeds'];
}): ISystemConfig {
  const { entry, supportedPredecessors, environmentId, env, retention, seeds } =
    props;
  return {
    entry,
    supportedPredecessors,
    environmentId: environmentId ?? 'dev',
    env: env ?? null,
    retention: retention ?? {
      clientLeaseSeconds: 90,
      stagedJournalDays: 30,
    },
    seeds: seeds ?? {
      dev: null,
      production: null,
    },
  };
}
