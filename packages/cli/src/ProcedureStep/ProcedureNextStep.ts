import type { ReactNode } from 'react';

import { useProcedureStepContext } from './ProcedureStepContext.js';

type NextProcedureStepProps = {
  children: ReactNode;
};

export function ProcedureNextStep({ children }: NextProcedureStepProps) {
  const status = useProcedureStepContext();

  if (status !== 'success') {
    return null;
  }

  return children;
}

ProcedureNextStep.displayName = 'NextProcedureStep';
