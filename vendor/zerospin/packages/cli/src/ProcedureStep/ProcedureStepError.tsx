import { useEffect } from 'react';

import { isZerospinError, type IAnyError } from '@zerospin/error';
import { Box, Text } from 'ink';

import { useProcedureStepContext } from './ProcedureStepContext.js';

function formatZerospinErrorDetails(error: IAnyError): string {
  return JSON.stringify(
    {
      cause: error.cause,
      code: error.code,
      extra: error.extra ?? null,
      status: error.status ?? null,
    },
    null,
    2,
  );
}

type IProcedureStepErrorProps = {
  description: string;
  error?: IAnyError | null | undefined;
};

export function ProcedureStepError({
  description,
  error,
}: IProcedureStepErrorProps) {
  const status = useProcedureStepContext();

  useEffect(() => {
    if (status !== 'error' || !error) {
      return;
    }
    process.exitCode = 1;
  }, [status, error]);

  if (status !== 'error' || !error) {
    return null;
  }

  const message = `${description}. ${error.message}`;

  return (
    <Box flexDirection="column">
      <Box>
        <Text color="red">✘</Text>
        <Box marginLeft={1}>
          <Text color="red">{message}</Text>
        </Box>
      </Box>
      {isZerospinError(error) && (
        <Box marginLeft={2}>
          <Text>{formatZerospinErrorDetails(error)}</Text>
        </Box>
      )}
    </Box>
  );
}

ProcedureStepError.displayName = 'ProcedureStepError';
