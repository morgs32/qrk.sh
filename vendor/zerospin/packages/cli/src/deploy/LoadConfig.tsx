import type { ReactNode } from 'react';

import * as NodeFileSystem from '@effect/platform-node/NodeFileSystem';
import * as NodePath from '@effect/platform-node/NodePath';
import { Effect, Layer } from 'effect';
import { Text } from 'ink';

import { ProcedureNextStep } from '../ProcedureStep/ProcedureNextStep.js';
import { ProcedureStep } from '../ProcedureStep/ProcedureStep.js';
import { ProcedureStepError } from '../ProcedureStep/ProcedureStepError.js';
import { ProcedureStepLoading } from '../ProcedureStep/ProcedureStepLoading.js';
import { ProcedureStepSuccess } from '../ProcedureStep/ProcedureStepSuccess.js';
import { useProgram } from '../ProcedureStep/useProgram.js';

import { loadConfigFn, type ILoadConfigResults } from './loadConfigFn.js';

export function LoadConfig({
  children,
}: {
  children: (data: ILoadConfigResults) => ReactNode;
}) {
  const { data, error, status } = useProgram({
    fetcher: () =>
      loadConfigFn().pipe(
        Effect.provide(Layer.mergeAll(NodeFileSystem.layer, NodePath.layer)),
      ),
  });

  return (
    <ProcedureStep status={status}>
      <ProcedureStepError
        description="Failed to load config"
        error={error ?? null}
      />
      {data && (
        <ProcedureStepSuccess>
          <Text>Config loaded</Text>
        </ProcedureStepSuccess>
      )}
      <ProcedureStepLoading message="Loading zerospin.config..." />
      {data && <ProcedureNextStep>{children(data)}</ProcedureNextStep>}
    </ProcedureStep>
  );
}
