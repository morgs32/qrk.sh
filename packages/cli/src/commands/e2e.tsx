import * as NodeChildProcessSpawner from '@effect/platform-node-shared/NodeChildProcessSpawner';
import * as NodeFileSystem from '@effect/platform-node-shared/NodeFileSystem';
import * as NodePath from '@effect/platform-node-shared/NodePath';
import { Effect, Layer } from 'effect';
import { Box, Text } from 'ink';

import { ErrorBoundary } from '../components/ErrorBoundary.js';
import { Header } from '../components/Header.js';
import { e2eFn } from '../e2e/e2eFn.js';
import { ProcedureStep } from '../ProcedureStep/ProcedureStep.js';
import { ProcedureStepError } from '../ProcedureStep/ProcedureStepError.js';
import { ProcedureStepLoading } from '../ProcedureStep/ProcedureStepLoading.js';
import { ProcedureStepSuccess } from '../ProcedureStep/ProcedureStepSuccess.js';
import { useProgram } from '../ProcedureStep/useProgram.js';

export default function E2e() {
  const { data, error, status } = useProgram({
    fetcher: () =>
      e2eFn().pipe(
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
    <ErrorBoundary>
      <Box flexDirection="column">
        <Header />
        <ProcedureStep status={status}>
          <ProcedureStepError
            description="Failed to run zerospin e2e"
            error={error ?? null}
          />
          {data && (
            <ProcedureStepSuccess>
              <Text>E2E passed</Text>
            </ProcedureStepSuccess>
          )}
          <ProcedureStepLoading message="Running Zerospin e2e..." />
        </ProcedureStep>
      </Box>
    </ErrorBoundary>
  );
}
