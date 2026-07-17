import type { ReactElement } from 'react';

import { Box, Text } from 'ink';

import { useProcedureStepContext } from './ProcedureStepContext.js';

type IProps = {
  children: ReactElement | ReactElement[];
};

export function ProcedureStepSuccess({ children }: IProps) {
  const status = useProcedureStepContext();

  if (status !== 'success') {
    return null;
  }

  return (
    <Box>
      <Text color="green">◆</Text>
      <Box marginLeft={1}>{children}</Box>
    </Box>
  );
}

ProcedureStepSuccess.displayName = 'ProcedureStepSuccess';
