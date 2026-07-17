import type {
  ISystem,
  ISystemConfig,
  ISystemEnvironmentId,
} from '@zerospin/core/system/types';
import { Box, Text } from 'ink';

import { ProcedureStep } from '../ProcedureStep/ProcedureStep.js';
import { ProcedureStepError } from '../ProcedureStep/ProcedureStepError.js';
import { ProcedureStepLoading } from '../ProcedureStep/ProcedureStepLoading.js';
import { ProcedureStepSuccess } from '../ProcedureStep/ProcedureStepSuccess.js';
import { useProgram } from '../ProcedureStep/useProgram.js';

import { deploySystemFn, type IResult } from './deploySystemFn.js';

function formatSeedStatus(props: {
  clean: boolean;
  environmentId: ISystemEnvironmentId;
  seedCommandsFinalized: number;
  seedsLoadedCount: number;
}): string {
  const { clean, environmentId, seedCommandsFinalized, seedsLoadedCount } =
    props;

  if (seedCommandsFinalized > 0) {
    return `Seed: ${seedCommandsFinalized} finalized`;
  }
  if (environmentId === 'production') {
    return 'Seeds: not run in production deploy';
  }
  if (!clean && seedsLoadedCount > 0) {
    return 'Seeds: skipped (use --clean to run seeds)';
  }
  if (seedsLoadedCount === 0) {
    return 'Seeds: none configured';
  }
  return 'Seed: 0 finalized';
}

export function DeploySystem(props: {
  clean: boolean;
  zerospinSecretKey: string;
  zerospinApiUrl: string;
  compiledSystemWorker: string;
  environmentId: ISystemEnvironmentId;
  system: ISystem;
  config: ISystemConfig;
}) {
  const {
    clean,
    zerospinSecretKey,
    zerospinApiUrl,
    compiledSystemWorker,
    environmentId,
    system,
    config,
  } = props;

  const { data, error, status } = useProgram<IResult>({
    fetcher: () =>
      deploySystemFn({
        clean,
        zerospinSecretKey,
        zerospinApiUrl,
        compiledSystemWorker,
        environmentId,
        system,
        config,
      }),
  });

  return (
    <ProcedureStep status={status}>
      <ProcedureStepError
        description="Failed to deploy system worker"
        error={error ?? null}
      />
      {data && (
        <ProcedureStepSuccess>
          <Box flexDirection="column">
            <Text>Deploy succeeded</Text>
            <Box marginLeft={2}>
              <Text dimColor>Environment: {environmentId}</Text>
            </Box>
            <Box marginLeft={2}>
              <Text dimColor>
                Deployed version: {data.cloudflareDeploymentId}
              </Text>
            </Box>
            <Box marginLeft={2}>
              <Text dimColor>
                {formatSeedStatus({
                  clean,
                  environmentId,
                  seedCommandsFinalized: data.seedCommandsFinalized,
                  seedsLoadedCount: data.seedsLoadedCount,
                })}
              </Text>
            </Box>
            <Box marginLeft={2}>
              <Text dimColor>
                {JSON.stringify(
                  {
                    zerospinApiUrl: data.zerospinApiUrl,
                    compiledLength: data.compiledLength,
                    environmentId: data.environmentId,
                    cloudflareDeploymentId: data.cloudflareDeploymentId,
                    seedCommandsFinalized: data.seedCommandsFinalized,
                    seedsLoadedCount: data.seedsLoadedCount,
                  },
                  null,
                  2,
                )}
              </Text>
            </Box>
          </Box>
        </ProcedureStepSuccess>
      )}
      <ProcedureStepLoading
        message={`Deploying to ${zerospinApiUrl} (${environmentId})...`}
      />
    </ProcedureStep>
  );
}
