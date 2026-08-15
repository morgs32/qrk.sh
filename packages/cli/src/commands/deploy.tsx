/* eslint-disable react-refresh/only-export-components */

import { Box } from 'ink';
import zod from 'zod';

import { ErrorBoundary } from '../components/ErrorBoundary.js';
import { Header } from '../components/Header.js';
import { CompileWorkerBundle } from '../deploy/CompileWorkerBundle.js';
import { DeploySystem } from '../deploy/DeploySystem.js';
import { DeployWrangler } from '../deploy/DeployWrangler.js';
import { LoadConfig } from '../deploy/LoadConfig.js';

export const isDefault = true;

export const options = zod.object({
  env: zod
    .enum(['dev', 'production'])
    .optional()
    .describe('Deploy namespace/environment (dev or prod, defaults to dev)'),
  clean: zod
    .boolean()
    .default(false)
    .describe('Request a clean deploy (passed through to the API)'),
  wrangler: zod
    .boolean()
    .default(false)
    .describe('Deploy directly to the current Wrangler account'),
});

type IDeployOptions = zod.infer<typeof options>;

export default function Deploy(props: { options: IDeployOptions }) {
  const { options } = props;
  const { env, clean, wrangler } = options;
  const environmentId = env ?? 'dev';

  // This branch occurs before LoadConfig is rendered. Production deployment
  // therefore never loads a hosted API URL or hosted Zerospin credential.
  if (wrangler) {
    return (
      <ErrorBoundary>
        <Box flexDirection="column">
          <Header />
          <DeployWrangler clean={clean} />
        </Box>
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <Box flexDirection="column">
        <Header />
        <LoadConfig>
          {({ zerospinSecretKey, zerospinApiUrl, config: loadedConfig }) => {
            const config = { ...loadedConfig, environmentId };
            return (
              <CompileWorkerBundle config={config}>
                {({ workerBundle, systemSpec }) => (
                  <DeploySystem
                    clean={clean}
                    workerBundle={workerBundle}
                    environmentId={environmentId}
                    zerospinSecretKey={zerospinSecretKey}
                    zerospinApiUrl={zerospinApiUrl}
                    systemSpec={systemSpec}
                    config={config}
                  />
                )}
              </CompileWorkerBundle>
            );
          }}
        </LoadConfig>
      </Box>
    </ErrorBoundary>
  );
}
