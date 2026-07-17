import * as NodeFileSystem from '@effect/platform-node/NodeFileSystem';
import * as NodePath from '@effect/platform-node/NodePath';
import { startStudio } from '@zerospin/studio/startStudio';
import { Effect, Layer } from 'effect';
import { Box, Text } from 'ink';

import { ErrorBoundary } from '../components/ErrorBoundary.js';
import { Header } from '../components/Header.js';
import { loadConfigFn } from '../deploy/loadConfigFn.js';
import { ProcedureStep } from '../ProcedureStep/ProcedureStep.js';
import { ProcedureStepError } from '../ProcedureStep/ProcedureStepError.js';
import { ProcedureStepLoading } from '../ProcedureStep/ProcedureStepLoading.js';
import { ProcedureStepSuccess } from '../ProcedureStep/ProcedureStepSuccess.js';
import { useProgram } from '../ProcedureStep/useProgram.js';

export default function Studio() {
  const { data, error, status } = useProgram({
    fetcher: () =>
      Effect.gen(function* () {
        const { zerospinApiUrl, zerospinSecretKey } = yield* loadConfigFn();
        return yield* startStudio({
          port: 5555,
          open: true,
          zerospinApiUrl,
          zerospinSecretKey,
        });
      }).pipe(
        Effect.provide(Layer.mergeAll(NodeFileSystem.layer, NodePath.layer)),
      ),
  });

  return (
    <ErrorBoundary>
      <Box flexDirection="column">
        <Header />
        <ProcedureStep status={status}>
          <ProcedureStepError
            description="Failed to start Zerospin Studio"
            error={error ?? null}
          />
          {data && (
            <ProcedureStepSuccess>
              <Text>Studio running at {data}</Text>
            </ProcedureStepSuccess>
          )}
          <ProcedureStepLoading message="Starting Zerospin Studio..." />
        </ProcedureStep>
      </Box>
    </ErrorBoundary>
  );
}
