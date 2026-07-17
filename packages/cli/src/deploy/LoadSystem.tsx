import type { ReactNode } from 'react';

import * as NodeFileSystem from '@effect/platform-node/NodeFileSystem';
import * as NodePath from '@effect/platform-node/NodePath';
import type { ISystem, ISystemConfig } from '@zerospin/core/system/types';
import { Effect, Layer } from 'effect';
import { Text } from 'ink';

import { ProcedureNextStep } from '../ProcedureStep/ProcedureNextStep.js';
import { ProcedureStep } from '../ProcedureStep/ProcedureStep.js';
import { ProcedureStepError } from '../ProcedureStep/ProcedureStepError.js';
import { ProcedureStepLoading } from '../ProcedureStep/ProcedureStepLoading.js';
import { ProcedureStepSuccess } from '../ProcedureStep/ProcedureStepSuccess.js';
import { useProgram } from '../ProcedureStep/useProgram.js';

import { loadSystemFn } from './loadSystemFn.js';

export function LoadSystem({
  config,
  children,
}: {
  config: ISystemConfig;
  children: (data: { system: ISystem }) => ReactNode;
}) {
  const {
    data: system,
    error,
    status,
  } = useProgram({
    fetcher: () =>
      loadSystemFn(config).pipe(
        Effect.provide(Layer.mergeAll(NodeFileSystem.layer, NodePath.layer)),
      ),
  });

  return (
    <ProcedureStep status={status}>
      <ProcedureStepError
        description="Failed to load system"
        error={error ?? null}
      />
      {system && (
        <ProcedureStepSuccess>
          <Text>
            System loaded ({system.name} v{system.version})
          </Text>
        </ProcedureStepSuccess>
      )}
      <ProcedureStepLoading message="Loading system..." />
      {system != null && (
        <ProcedureNextStep>{children({ system })}</ProcedureNextStep>
      )}
    </ProcedureStep>
  );
}
