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
      {/*
       * Keep this marker inside Ink itself. The third-party animated Spinner imports React but
       * declares only Ink as a peer, so a consuming monorepo can make Spinner and Ink resolve two
       * different React instances. That prevents the CLI from reaching Wrangler at all.
       */}
      <Text color="cyan">…</Text>
      {message && (
        <Box marginLeft={1}>
          <Text>{message}</Text>
        </Box>
      )}
    </Box>
  );
}
