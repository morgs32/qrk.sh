/* eslint-disable react-refresh/only-export-components */

import { Box } from 'ink';
import zod from 'zod';

import { ErrorBoundary } from '../components/ErrorBoundary.js';
import { Header } from '../components/Header.js';
import { CompileSystemWorker } from '../deploy/CompileSystemWorker.js';
import { DeploySystem } from '../deploy/DeploySystem.js';
import { LoadConfig } from '../deploy/LoadConfig.js';
import { LoadSystem } from '../deploy/LoadSystem.js';
import { WriteLocalSystemWorker } from '../deploy/WriteLocalSystemWorker.js';

export const isDefault = true;

export const options = zod.object({
  env: zod
    .enum(['dev', 'production'])
    .optional()
    .describe('Deploy namespace/environment (dev or prod, defaults to dev)'),
  local: zod
    .union([zod.boolean(), zod.string()])
    .optional()
    .describe('Write compiled worker locally, optionally to a custom path'),
  clean: zod
    .boolean()
    .default(false)
    .describe('Request a clean deploy (passed through to the API)'),
});

type IDeployOptions = zod.infer<typeof options>;

export default function Deploy(props: { options: IDeployOptions }) {
  const { options } = props;
  const { env, local, clean } = options;
  const environmentId = env ?? 'dev';
  const localOutputPath = typeof local === 'string' ? local : null;

  return (
    <ErrorBoundary>
      <Box flexDirection="column">
        <Header />
        <LoadConfig>
          {({ zerospinSecretKey, zerospinApiUrl, config: loadedConfig }) => {
            const config = { ...loadedConfig, environmentId };
            return (
              <CompileSystemWorker config={config}>
                {({ compiledSystemWorker }) => (
                  <LoadSystem config={config}>
                    {({ system }) =>
                      local ? (
                        <WriteLocalSystemWorker
                          compiledSystemWorker={compiledSystemWorker}
                          outputPath={localOutputPath}
                        />
                      ) : (
                        <DeploySystem
                          clean={clean}
                          compiledSystemWorker={compiledSystemWorker}
                          environmentId={environmentId}
                          zerospinSecretKey={zerospinSecretKey}
                          zerospinApiUrl={zerospinApiUrl}
                          system={system}
                          config={config}
                        />
                      )
                    }
                  </LoadSystem>
                )}
              </CompileSystemWorker>
            );
          }}
        </LoadConfig>
      </Box>
    </ErrorBoundary>
  );
}
