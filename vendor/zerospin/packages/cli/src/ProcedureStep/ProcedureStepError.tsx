import { useEffect, useState } from 'react';

import { mkdirSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { ZerospinError, type IAnyError } from '@zerospin/error';
import { Box, Text } from 'ink';
import { nanoid } from 'nanoid';

import { useProcedureStepContext } from './ProcedureStepContext.js';

function snakeCaseFirstThreeWords(code: string): string {
  const words = code
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(/\s+|_|-/)
    .filter(Boolean)
    .slice(0, 3);
  return words.join('_').toLowerCase() || 'error';
}

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

type ProcedureStepErrorProps = {
  description: string;
  error?: IAnyError | null | undefined;
};

export function ProcedureStepError({
  description,
  error,
}: ProcedureStepErrorProps) {
  const status = useProcedureStepContext();
  const [savedPath, setSavedPath] = useState<string | null>(null);

  useEffect(() => {
    if (status !== 'error' || !error) {
      return;
    }
    process.exitCode = 1;

    if (ZerospinError.isZerospinError(error)) {
      const prefix = snakeCaseFirstThreeWords(error.code);
      const id = nanoid();
      const filename = `${prefix}_${id}.txt`;
      const dir = join(process.cwd(), 'tmp');
      mkdirSync(dir, { recursive: true });
      const filePath = join(dir, filename);
      writeFileSync(
        filePath,
        `${error.toString()}\n\n${formatZerospinErrorDetails(error)}\n`,
        'utf-8',
      );
      setSavedPath(filePath);
    }
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
      {savedPath && (
        <Box marginLeft={2}>
          <Text>{relative(process.cwd(), savedPath)}</Text>
        </Box>
      )}
    </Box>
  );
}

ProcedureStepError.displayName = 'ProcedureStepError';
