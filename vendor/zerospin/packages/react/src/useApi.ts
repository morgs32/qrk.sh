'use client';

import { useMemo } from 'react';

import type { IAnyActorApi } from '@zerospin/core/actorController/types';
import type { IFrontendController } from '@zerospin/core/frontendController/types';
import type { ITypeError } from '@zerospin/core/utils/types';
import type { IAnyError } from '@zerospin/error';
import { executeActorQuery } from '@zerospin/frontend/executeActorQuery';
import { makeTelemetryLayer } from '@zerospin/logger';
import { Effect, type Either, type Schema } from 'effect';

import type { IReactFrontend } from './types';
import { useCtxOrThrow } from './useCtxOrThrow';

export function useApi<
  ACTOR extends {
    name: string;
    api: IAnyActorApi;
  } & (keyof ACTOR['api'] extends never
    ? ITypeError<'Actor must configure an actor API'>
    : unknown),
>(reactFrontend: {
  frontend: Pick<IFrontendController<string, ACTOR['name']>, 'actorName'>;
  ReactContext: object;
  sessionRuntime: IReactFrontend<IFrontendController>['sessionRuntime'];
}) {
  const { session } = useCtxOrThrow(
    reactFrontend as Pick<IReactFrontend<IFrontendController>, 'ReactContext'>,
  );
  const { sessionRuntime } = reactFrontend;

  return useMemo(
    () => ({
      async executeActorQuery<
        QUERY_NAME extends keyof ACTOR['api'] & string,
      >(props: {
        queryName: QUERY_NAME;
        params: Schema.Schema.Type<ACTOR['api'][QUERY_NAME]['paramsSchema']>;
      }): Promise<
        Either.Either<
          ReturnType<ACTOR['api'][QUERY_NAME]['query']> extends Effect.Effect<
            infer SUCCESS,
            infer _ERROR,
            infer _CONTEXT
          >
            ? SUCCESS
            : never,
          IAnyError
        >
      > {
        const { params, queryName } = props;
        return sessionRuntime.runPromise(
          executeActorQuery<ACTOR, typeof session.frontend, QUERY_NAME>({
            session: session.coreSession,
            queryName,
            params,
          }).pipe(
            Effect.either,
            Effect.provide(
              makeTelemetryLayer(
                session.coreSession.store.getState().telemetryCollector,
              ),
            ),
          ),
        );
      },
    }),
    [session, sessionRuntime],
  );
}
