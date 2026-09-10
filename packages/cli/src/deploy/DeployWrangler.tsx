import * as NodeChildProcessSpawner from '@effect/platform-node-shared/NodeChildProcessSpawner';
import * as NodeFileSystem from '@effect/platform-node-shared/NodeFileSystem';
import * as NodePath from '@effect/platform-node-shared/NodePath';
import { Effect, Layer } from 'effect';
import { Box, Text } from 'ink';

import { ProcedureStep } from '../ProcedureStep/ProcedureStep.js';
import { ProcedureStepError } from '../ProcedureStep/ProcedureStepError.js';
import { ProcedureStepLoading } from '../ProcedureStep/ProcedureStepLoading.js';
import { ProcedureStepSuccess } from '../ProcedureStep/ProcedureStepSuccess.js';
import { useProgram } from '../ProcedureStep/useProgram.js';

import { deployWranglerFn } from './deployWranglerFn.js';

export function DeployWrangler() {
  const { data, error, status } = useProgram({
    fetcher: () =>
      deployWranglerFn().pipe(
        Effect.provide(
          NodeChildProcessSpawner.layer.pipe(
            Layer.provideMerge(
              Layer.mergeAll(NodeFileSystem.layer, NodePath.layer),
            ),
          ),
        ),
      ),
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
              deploy`:
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
            <Text>Worker: {data.workerName}</Text>
            <Text>Version: {data.versionId}</Text>
            <Text>Application variables:</Text>
            <Text>ZEROSPIN_PUBLISHABLE_KEY={data.zerospinPublishableKey}</Text>
          </Box>
        </ProcedureStepSuccess>
      )}
      <ProcedureStepLoading message="Deploying Zerospin through Wrangler..." />
    </ProcedureStep>
  );
}
