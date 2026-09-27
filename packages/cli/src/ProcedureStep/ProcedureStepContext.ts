import { createContext, useContext } from 'react';

export type IProcedureStepStatus =
  | 'error'
  | 'loading'
  | 'prompt'
  | 'saving'
  | 'success';

export const ProcedureStepContext = createContext<null | IProcedureStepStatus>(
  null,
);

ProcedureStepContext.displayName = 'ProcedureStepContext';

export function useProcedureStepContext() {
  const context = useContext(ProcedureStepContext);

  if (!context) {
    throw new Error(
      'ProcedureStep components must be used within <ProcedureStep>.',
    );
  }

  return context;
}
