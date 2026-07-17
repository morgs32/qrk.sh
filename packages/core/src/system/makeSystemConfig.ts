import type { ISystemConfig, ISystemEnvironmentId } from './types.ts';

export function makeSystemConfig(props: {
  entry: string;
  environmentId?: ISystemEnvironmentId;
  env?: Record<string, string>;
  seeds?: ISystemConfig['seeds'];
}): ISystemConfig {
  const { entry, environmentId, env, seeds } = props;
  return {
    entry,
    environmentId: environmentId ?? 'dev',
    env: env ?? null,
    seeds: seeds ?? null,
  };
}
