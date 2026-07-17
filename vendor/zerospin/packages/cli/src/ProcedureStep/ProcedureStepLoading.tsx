import { Spinner } from '@inkjs/ui';
import { Box, Text } from 'ink';

import { useProcedureStepContext } from './ProcedureStepContext.js';

type ProcedureStepLoadingProps = {
  message?: string | undefined;
};

export function ProcedureStepLoading({ message }: ProcedureStepLoadingProps) {
  const status = useProcedureStepContext();

  if (status !== 'loading') {
    return null;
  }

  return (
    <Box>
      <Spinner />
      {message && (
        <Box marginLeft={1}>
          <Text>{message}</Text>
        </Box>
      )}
    </Box>
  );
}
