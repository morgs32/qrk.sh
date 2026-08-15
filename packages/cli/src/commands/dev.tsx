import { Box } from 'ink';
import zod from 'zod';

import { ErrorBoundary } from '../components/ErrorBoundary.js';
import { Header } from '../components/Header.js';
import { CheckWranglerConfig } from '../dev/CheckWranglerConfig.js';
import { Dev as DevStep } from '../dev/Dev.js';

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

  return (
    <ErrorBoundary>
      <Box flexDirection="column">
        <Header />
        <CheckWranglerConfig>
          {systemId => (
            <DevStep
              clean={options.clean}
              port={options.port}
              systemId={systemId}
            />
          )}
        </CheckWranglerConfig>
      </Box>
    </ErrorBoundary>
  );
}
