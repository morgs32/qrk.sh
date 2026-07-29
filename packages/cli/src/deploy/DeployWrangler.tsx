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
            <Text>Self-hosted Zerospin keys generated; nothing deployed.</Text>
            <Text>
              Copy these values into {data.envFilePath}, then rerun `zerospin
              deploy --wrangler`:
            </Text>
            <Text>ZEROSPIN_PUBLISHABLE_KEY={data.zerospinPublishableKey}</Text>
            <Text>ZEROSPIN_SECRET_KEY={data.zerospinSecretKey}</Text>
            <Text>
              Keep ZEROSPIN_SECRET_KEY private. Configure the browser with
              NEXT_PUBLIC_ZEROSPIN_PUBLISHABLE_KEY using the same publishable
              value.
            </Text>
          </Box>
        </ProcedureStepSuccess>
      )}
      {data?.status === 'deployed' && (
        <ProcedureStepSuccess>
          <Box flexDirection="column">
            <Text>Self-hosted Zerospin deploy succeeded.</Text>
            <Text>Worker: {data.workerUrl}</Text>
            <Text>Local production seed variable:</Text>
            <Text>ZEROSPIN_WRANGLER_API_URL={data.workerUrl}</Text>
            <Text>Vercel production variables:</Text>
            <Text>NEXT_PUBLIC_ZEROSPIN_API_URL={data.workerUrl}</Text>
            <Text>
              NEXT_PUBLIC_ZEROSPIN_PUBLISHABLE_KEY=
              {data.zerospinPublishableKey}
            </Text>
          </Box>
        </ProcedureStepSuccess>
      )}
      <ProcedureStepLoading message="Deploying Zerospin through Wrangler..." />
    </ProcedureStep>
  );
}
