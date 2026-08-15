import * as NodeContext from '@effect/platform-node/NodeContext';
import type { ISystemId } from '@zerospin/core/system/types';
import { Effect } from 'effect';
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
      devFn({ clean, port, systemId }).pipe(Effect.provide(NodeContext.layer)),
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
