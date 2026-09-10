import * as NodeFileSystem from '@effect/platform-node-shared/NodeFileSystem';
import * as NodePath from '@effect/platform-node-shared/NodePath';
import * as NodeTerminal from '@effect/platform-node-shared/NodeTerminal';
import type { ISystemId } from '@zerospin/core/system/types';
import { Effect, Layer } from 'effect';
import { Text } from 'ink';

import { ProcedureStep } from '../ProcedureStep/ProcedureStep.js';
import { ProcedureStepError } from '../ProcedureStep/ProcedureStepError.js';
import { ProcedureStepSuccess } from '../ProcedureStep/ProcedureStepSuccess.js';
import { useProgram } from '../ProcedureStep/useProgram.js';

import { devFn } from './devFn.js';

export function Dev(props: {
  clean: boolean;
  port: number | undefined;
  systemId: ISystemId;
}) {
  const { clean, port, systemId } = props;
  const { data, error, status } = useProgram({
    fetcher: () =>
      devFn({ clean, port, systemId }).pipe(
        Effect.provide(
          Layer.mergeAll(
            NodeFileSystem.layer,
            NodePath.layer,
            NodeTerminal.layer,
          ),
        ),
      ),
  });

  return (
    <ProcedureStep status={status}>
      <ProcedureStepError
        description="Failed to run zerospin dev"
        error={error ?? null}
      />
      {data && (
        <ProcedureStepSuccess>
          <Text>Zerospin dev stopped</Text>
        </ProcedureStepSuccess>
      )}
      {status === 'loading' && <Text>Running zerospin dev...</Text>}
    </ProcedureStep>
  );
}
