import { useEffect, useMemo, useRef, useState } from 'react';

import { type Async } from '@zerospin/core/async/Async';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { ZerospinError, type IAnyError } from '@zerospin/error';
import { Cause, Effect, Exit, Option } from 'effect';

type IProps<TData, TError> = {
  fetcher: () => Effect.Effect<TData, TError, Async>;
};

type IState<TData, TError> = {
  data: TData | undefined;
  error: TError | undefined;
  status: 'error' | 'loading' | 'success';
};

type ILoadingState<TData, TError> = {
  status: 'loading';
} & IState<TData, TError>;

type ISuccessState<TData, TError> = {
  status: 'success';
} & IState<TData, TError>;

type IErrorState<TData, TError> = {
  data: undefined;
  error: TError;
  status: 'error';
} & IState<TData, TError>;

export type UseProgramResult<TData, TError> =
  | IErrorState<TData, TError>
  | ILoadingState<TData, TError>
  | ISuccessState<TData, TError>;

export function useProgram<TData, TError extends IAnyError = IAnyError>(
  options: IProps<TData, TError>,
): UseProgramResult<TData, TError | ZerospinError<'unexpected-error'>> {
  const { fetcher } = options;
  // Ink re-renders often; a new inline `() => myEffect` each time must not
  // retrigger this effect (that caused an infinite fetch loop in the CLI).
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const [exit, setExit] = useState<Exit.Exit<TData, TError> | undefined>(
    undefined,
  );
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsLoading(true);
    setExit(undefined);

    fetcherRef
      .current()
      .pipe(Effect.provide(AsyncLive), Effect.exit, Effect.runPromise)
      .then(result => {
        setExit(result);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  return useMemo(() => {
    if (isLoading || !exit) {
      return {
        data: undefined,
        error: undefined,
        status: 'loading' as const,
      };
    }
    if (Exit.isFailure(exit)) {
      const error = Option.match(Cause.failureOption(exit.cause), {
        onNone: () => {
          return new ZerospinError({
            code: 'unexpected-error',
            message: Cause.pretty(exit.cause),
          });
        },
        onSome: e => e,
      });
      return {
        data: undefined,
        error,
        status: 'error' as const,
      };
    }
    return {
      data: exit.value,
      error: undefined,
      status: 'success' as const,
    };
  }, [isLoading, exit]);
}
