import { Box, Text } from 'ink';
import zod from 'zod';

import { ErrorBoundary } from '../components/ErrorBoundary.js';
import { Header } from '../components/Header.js';
import { ProcedureStep } from '../ProcedureStep/ProcedureStep.js';
import { ProcedureStepError } from '../ProcedureStep/ProcedureStepError.js';
import { ProcedureStepLoading } from '../ProcedureStep/ProcedureStepLoading.js';
import { ProcedureStepSuccess } from '../ProcedureStep/ProcedureStepSuccess.js';
import { useProgram } from '../ProcedureStep/useProgram.js';
import { seedWranglerFn } from '../seed/seedWranglerFn.js';

export const options = zod.object({
  env: zod
    .literal('production')
    .default('production')
    .describe('Seed environment (production only)'),
  wrangler: zod
    .boolean()
    .default(false)
    .describe('Submit directly to the self-hosted Wrangler Worker'),
});

export default function Seed(props: {
  options: {
    env: 'production';
    wrangler: boolean;
  };
}) {
  const { data, error, status } = useProgram({
    fetcher: () =>
      seedWranglerFn({
        environmentId: props.options.env,
        wrangler: props.options.wrangler,
      }),
  });

  return (
    <ErrorBoundary>
      <Box flexDirection="column">
        <Header />
        <ProcedureStep status={status}>
          <ProcedureStepError
            description="Failed to seed self-hosted Zerospin"
            error={error ?? null}
          />
          {data && (
            <ProcedureStepSuccess>
              <Box flexDirection="column">
                <Text>Production seed operation succeeded.</Text>
                <Text>Worker: {data.workerUrl}</Text>
                <Text>Loaded commands: {data.seedsLoadedCount}</Text>
                <Text>Finalized commands: {data.seedCommandsFinalized}</Text>
              </Box>
            </ProcedureStepSuccess>
          )}
          <ProcedureStepLoading message="Submitting production seeds..." />
        </ProcedureStep>
      </Box>
    </ErrorBoundary>
  );
}
