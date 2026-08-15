import { Box, Text } from 'ink';

import { ProcedureStep } from '../ProcedureStep/ProcedureStep.js';
import { ProcedureStepError } from '../ProcedureStep/ProcedureStepError.js';
import { ProcedureStepLoading } from '../ProcedureStep/ProcedureStepLoading.js';
import { ProcedureStepSuccess } from '../ProcedureStep/ProcedureStepSuccess.js';
import { useProgram } from '../ProcedureStep/useProgram.js';

import { deployWranglerFn } from './deployWranglerFn.js';

export function DeployWrangler(props: { clean: boolean }) {
  const { data, error, status } = useProgram({
    fetcher: () => deployWranglerFn({ clean: props.clean }),
  });

  return (
    <ProcedureStep status={status}>
      <ProcedureStepError
        description="Failed to deploy Zerospin with Wrangler"
        error={error ?? null}
      />
      {data?.status === 'keys-generated' && (
        <ProcedureStepSuccess>
          <Box flexDirection="column">
            <Text>Production Zerospin keys generated; nothing deployed.</Text>
            <Text>
              Copy these values into {data.envFilePath}, then rerun `zerospin
              deploy --wrangler`:
            </Text>
            <Text>ZEROSPIN_PUBLISHABLE_KEY={data.zerospinPublishableKey}</Text>
            <Text>ZEROSPIN_SECRET_KEY={data.zerospinSecretKey}</Text>
            <Text>
              Keep ZEROSPIN_SECRET_KEY private. Expose only
              ZEROSPIN_PUBLISHABLE_KEY to clients.
            </Text>
          </Box>
        </ProcedureStepSuccess>
      )}
      {data?.status === 'deployed' && (
        <ProcedureStepSuccess>
          <Box flexDirection="column">
            <Text>Production Zerospin deploy succeeded.</Text>
            <Text>Worker: {data.workerUrl}</Text>
            <Text>Application variables:</Text>
            <Text>ZEROSPIN_API_URL={data.workerUrl}</Text>
            <Text>ZEROSPIN_PUBLISHABLE_KEY={data.zerospinPublishableKey}</Text>
          </Box>
        </ProcedureStepSuccess>
      )}
      <ProcedureStepLoading message="Deploying Zerospin through Wrangler..." />
    </ProcedureStep>
  );
}
