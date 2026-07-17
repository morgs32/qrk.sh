import type { ReactNode } from 'react';

import { Path } from '@effect/platform';
import type { ISystemConfig } from '@zerospin/core/system/types';
import { Effect } from 'effect';
import { Text } from 'ink';

import { ProcedureNextStep } from '../ProcedureStep/ProcedureNextStep.js';
import { ProcedureStep } from '../ProcedureStep/ProcedureStep.js';
import { ProcedureStepError } from '../ProcedureStep/ProcedureStepError.js';
import { ProcedureStepLoading } from '../ProcedureStep/ProcedureStepLoading.js';
import { ProcedureStepSuccess } from '../ProcedureStep/ProcedureStepSuccess.js';
import { useProgram } from '../ProcedureStep/useProgram.js';

import { compileSystemWorkerFn } from './compileSystemWorkerFn.js';

export function CompileSystemWorker({
  config,
  children,
}: {
  config: ISystemConfig;
  children: (data: { compiledSystemWorker: string }) => ReactNode;
}) {
  const { data, error, status } = useProgram({
    fetcher: () =>
      compileSystemWorkerFn(config).pipe(Effect.provide(Path.layer)),
  });

  return (
    <ProcedureStep status={status}>
      <ProcedureStepError
        description="Failed to compile system worker"
        error={error ?? null}
      />
      {data && (
        <ProcedureStepSuccess>
          <Text>System compiled</Text>
        </ProcedureStepSuccess>
      )}
      <ProcedureStepLoading message="Compiling system entry..." />
      {data && <ProcedureNextStep>{children(data)}</ProcedureNextStep>}
    </ProcedureStep>
  );
}
