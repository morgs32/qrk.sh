import type { ReactNode } from 'react';

import { useProcedureStepContext } from './ProcedureStepContext.js';

type INextProcedureStepProps = {
  children: ReactNode;
};

export function ProcedureNextStep({ children }: INextProcedureStepProps) {
  const status = useProcedureStepContext();

  if (status !== 'success') {
    return null;
  }

  return children;
}

ProcedureNextStep.displayName = 'NextProcedureStep';
