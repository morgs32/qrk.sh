import type { ReactNode } from 'react';

import { Box, Text } from 'ink';

import {
  ProcedureStepContext,
  type ProcedureStepStatus,
} from './ProcedureStepContext.js';

type ProcedureStepProps = {
  children: ReactNode;
  status: ProcedureStepStatus;
};

export function ProcedureStep(props: ProcedureStepProps) {
  const { children, status } = props;

  return (
    <ProcedureStepContext.Provider value={status}>
      <Box flexDirection="column">
        <Text dimColor>│</Text>
        {children}
      </Box>
    </ProcedureStepContext.Provider>
  );
}
