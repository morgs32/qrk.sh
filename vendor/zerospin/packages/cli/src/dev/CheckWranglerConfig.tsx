import type { ReactNode } from 'react';

import type { ISystemId } from '@zerospin/core/system/types';
import { Text } from 'ink';

import { ProcedureNextStep } from '../ProcedureStep/ProcedureNextStep.js';
import { ProcedureStep } from '../ProcedureStep/ProcedureStep.js';
import { ProcedureStepError } from '../ProcedureStep/ProcedureStepError.js';
import { ProcedureStepLoading } from '../ProcedureStep/ProcedureStepLoading.js';
import { ProcedureStepSuccess } from '../ProcedureStep/ProcedureStepSuccess.js';
import { useProgram } from '../ProcedureStep/useProgram.js';

import { checkWranglerConfigFn } from './checkWranglerConfigFn.js';

export function CheckWranglerConfig(props: {
  children: (systemId: ISystemId) => ReactNode;
}) {
  const { children } = props;
  const { data, error, status } = useProgram({
    fetcher: checkWranglerConfigFn,
  });

  return (
    <ProcedureStep status={status}>
      <ProcedureStepError
        description="Failed to check wrangler.jsonc"
        error={error ?? null}
      />
      {data && (
        <ProcedureStepSuccess>
          <Text>Wrangler config valid</Text>
        </ProcedureStepSuccess>
      )}
      <ProcedureStepLoading message="Checking wrangler.jsonc..." />
      {data && <ProcedureNextStep>{children(data)}</ProcedureNextStep>}
    </ProcedureStep>
  );
}
