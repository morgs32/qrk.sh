import { Box, Text } from 'ink';
import zod from 'zod';

import { ErrorBoundary } from '../components/ErrorBoundary.js';
import { Header } from '../components/Header.js';
import { devFn } from '../dev/devFn.js';
import { ProcedureStep } from '../ProcedureStep/ProcedureStep.js';
import { ProcedureStepError } from '../ProcedureStep/ProcedureStepError.js';
import { ProcedureStepSuccess } from '../ProcedureStep/ProcedureStepSuccess.js';
import { useProgram } from '../ProcedureStep/useProgram.js';

export const options = zod.object({
  clean: zod
    .boolean()
    .default(false)
    .describe('Create and seed a detached local generation before serving'),
  port: zod
    .number()
    .int()
    .min(1)
    .max(65_535)
    .optional()
    .describe('Port for the local Zerospin API'),
});

export default function Dev(props: {
  options: {
    clean: boolean;
    port?: number | undefined;
  };
}) {
  const { options } = props;
  const { data, error, status } = useProgram({
    fetcher: () => devFn({ clean: options.clean, port: options.port }),
  });

  return (
    <ErrorBoundary>
      <Box flexDirection="column">
        <Header />
        <ProcedureStep status={status}>
          <ProcedureStepError
            description="Failed to run zerospin dev"
            error={error ?? null}
          />
          {data && (
            <ProcedureStepSuccess>
              <Text>Zerospin dev stopped</Text>
            </ProcedureStepSuccess>
          )}
          {status === 'loading' && <Text>Running zerospin dev...</Text>}
        </ProcedureStep>
      </Box>
    </ErrorBoundary>
  );
}
