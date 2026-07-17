import * as NodeFileSystem from '@effect/platform-node/NodeFileSystem';
import * as NodePath from '@effect/platform-node/NodePath';
import { Effect, Layer } from 'effect';
import { Box, Text } from 'ink';

import { ProcedureStep } from '../ProcedureStep/ProcedureStep.js';
import { ProcedureStepError } from '../ProcedureStep/ProcedureStepError.js';
import { ProcedureStepLoading } from '../ProcedureStep/ProcedureStepLoading.js';
import { ProcedureStepSuccess } from '../ProcedureStep/ProcedureStepSuccess.js';
import { useProgram } from '../ProcedureStep/useProgram.js';

import { writeLocalSystemWorkerFn } from './writeLocalSystemWorkerFn.js';

const layer = Layer.mergeAll(NodeFileSystem.layer, NodePath.layer);

export function WriteLocalSystemWorker(props: {
  compiledSystemWorker: string;
  outputPath: string | null;
}) {
  const { compiledSystemWorker, outputPath } = props;
  const { data, error, status } = useProgram({
    fetcher: () =>
      writeLocalSystemWorkerFn({ compiledSystemWorker, outputPath }).pipe(
        Effect.provide(layer),
      ),
  });

  return (
    <ProcedureStep status={status}>
      <ProcedureStepError
        description="Failed to write local system worker"
        error={error ?? null}
      />
      {data && (
        <ProcedureStepSuccess>
          <Box flexDirection="column">
            <Text>Local compile succeeded</Text>
            <Box marginLeft={2} flexDirection="column">
              <Text dimColor>{data.outputPath}</Text>
              <Text dimColor>{data.compiledLength} bytes</Text>
            </Box>
          </Box>
        </ProcedureStepSuccess>
      )}
      <ProcedureStepLoading
        message={`Writing compiled worker to ${outputPath ?? 'dist/index.js'}...`}
      />
    </ProcedureStep>
  );
}
