import type { ReactNode } from 'react';

import { Path } from '@effect/platform';
import * as NodeFileSystem from '@effect/platform-node/NodeFileSystem';
import type { ISystemConfig, ISystemSpec } from '@zerospin/core/system/types';
import { Effect, Layer } from 'effect';
import { Text } from 'ink';

import { ProcedureNextStep } from '../ProcedureStep/ProcedureNextStep.js';
import { ProcedureStep } from '../ProcedureStep/ProcedureStep.js';
import { ProcedureStepError } from '../ProcedureStep/ProcedureStepError.js';
import { ProcedureStepLoading } from '../ProcedureStep/ProcedureStepLoading.js';
import { ProcedureStepSuccess } from '../ProcedureStep/ProcedureStepSuccess.js';
import { useProgram } from '../ProcedureStep/useProgram.js';

import { compileWorkerBundleFn } from './compileWorkerBundleFn.js';

export function CompileWorkerBundle({
  config,
  children,
}: {
  config: ISystemConfig;
  children: (data: {
    workerBundle: string;
    systemSpec: ISystemSpec;
    systemVersion: string;
  }) => ReactNode;
}) {
  const { data, error, status } = useProgram({
    fetcher: () =>
      compileWorkerBundleFn(config).pipe(
        Effect.provide(Layer.mergeAll(NodeFileSystem.layer, Path.layer)),
      ),
  });

  return (
    <ProcedureStep status={status}>
      <ProcedureStepError
        description="Failed to bundle Worker"
        error={error ?? null}
      />
      {data && (
        <ProcedureStepSuccess>
          <Text>Worker bundled ({data.systemVersion})</Text>
        </ProcedureStepSuccess>
      )}
      <ProcedureStepLoading message="Bundling static Worker..." />
      {data && <ProcedureNextStep>{children(data)}</ProcedureNextStep>}
    </ProcedureStep>
  );
}
