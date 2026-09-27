import type { ReactNode } from 'react';

import { Box, Text } from 'ink';

import {
  ProcedureStepContext,
  type IProcedureStepStatus,
} from './ProcedureStepContext.js';

type IProcedureStepProps = {
  children: ReactNode;
  status: IProcedureStepStatus;
};

export function ProcedureStep(props: IProcedureStepProps) {
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
