import type { ReactNode } from 'react';
import { useEffect } from 'react';

/**
 * ProcedureStepError owns CLI failure exit codes, and ProcedureNextStep is rendered only when there is a real next step.
 *
 * @bad Do not set `process.exitCode` in each command component that renders `ProcedureStepError`.
 * @bad Do not render `<ProcedureNextStep>{null}</ProcedureNextStep>` for terminal commands.
 * @bad Do not pass `data ? children(data) : null` inside `ProcedureNextStep`; render the wrapper conditionally.
 */
export function ProcedureStepError(props: {
  description: string;
  error?: Error | null | undefined;
}) {
  const status = useProcedureStepContext();
  const { description, error } = props;

  useEffect(() => {
    if (status !== 'error' || !error) {
      return;
    }

    process.exitCode = 1;
  }, [status, error]);

  if (status !== 'error' || !error) {
    return null;
  }

  return <Text color="red">{`${description}. ${error.message}`}</Text>;
}

export function TerminalCommand() {
  const { data, error, status } = useProgram();

  return (
    <ProcedureStep status={status}>
      <ProcedureStepError description="Failed to run command" error={error} />
      {data && <ProcedureStepSuccess>Done</ProcedureStepSuccess>}
      <ProcedureStepLoading message="Running command..." />
    </ProcedureStep>
  );
}
export function PipelineStep(props: {
  children: (data: { id: string }) => ReactNode;
}) {
  const { children } = props;
  const { data, error, status } = useProgram();

  return (
    <ProcedureStep status={status}>
      <ProcedureStepError description="Failed to load data" error={error} />
      {data && <ProcedureStepSuccess>Loaded</ProcedureStepSuccess>}
      <ProcedureStepLoading message="Loading..." />
      {data && <ProcedureNextStep>{children(data)}</ProcedureNextStep>}
    </ProcedureStep>
  );
}
