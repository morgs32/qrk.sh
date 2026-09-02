import * as NodeFileSystem from '@effect/platform-node-shared/NodeFileSystem';
import * as NodePath from '@effect/platform-node-shared/NodePath';
import { Effect, Layer } from 'effect';
import { Box, Text } from 'ink';
import zod from 'zod';

import { ErrorBoundary } from '../components/ErrorBoundary.js';
import { Header } from '../components/Header.js';
import { ProcedureStep } from '../ProcedureStep/ProcedureStep.js';
import { ProcedureStepError } from '../ProcedureStep/ProcedureStepError.js';
import { ProcedureStepLoading } from '../ProcedureStep/ProcedureStepLoading.js';
import { ProcedureStepSuccess } from '../ProcedureStep/ProcedureStepSuccess.js';
import { useProgram } from '../ProcedureStep/useProgram.js';
import { seedFn } from '../seed/seedFn.js';

export const options = zod.object({
  env: zod
    .enum(['dev', 'production'])
    .default('dev')
    .describe('Configured seed environment'),
});

export default function Seed(props: { options: zod.infer<typeof options> }) {
  const { data, error, status } = useProgram({
    fetcher: () =>
      seedFn({ environmentId: props.options.env }).pipe(
        Effect.provide(Layer.mergeAll(NodeFileSystem.layer, NodePath.layer)),
      ),
  });

  return (
    <ErrorBoundary>
      <Box flexDirection="column">
        <Header />
        <ProcedureStep status={status}>
          <ProcedureStepError
            description="Failed to seed Zerospin"
            error={error ?? null}
          />
          {data && (
            <ProcedureStepSuccess>
              <Text>{data.commandsFinalized} seed commands finalized</Text>
            </ProcedureStepSuccess>
          )}
          <ProcedureStepLoading message="Finalizing seed commands..." />
        </ProcedureStep>
      </Box>
    </ErrorBoundary>
  );
}
