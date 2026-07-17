import { createContext } from 'react';

import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import type { IFrontendController } from '@zerospin/core/frontendController/types';
import type {
  IModel,
  InferIdFromAbbreviation,
} from '@zerospin/core/models/types';
import { PublishableKey } from '@zerospin/core/services/PublishableKey';
import { ZerospinApisUrl } from '@zerospin/core/services/ZerospinApisUrl';
import { makeIdFromAbbreviation } from '@zerospin/core/utils/makeIdFromAbbreviation';
import { NanoIdFactory } from '@zerospin/core/utils/NanoIdFactory';
import { UlidMonotonicFactory } from '@zerospin/core/utils/UlidMonotonicFactory';
import { ZerospinError, type IAnyError } from '@zerospin/error';
import { Effect, Layer, Logger, ManagedRuntime, Redacted } from 'effect';

import { makeProvider } from './makeProvider';
import type {
  IReactFrontend,
  IReactSessionContext,
  ISessionProviderLayer,
  ISessionProviderRuntime,
  ISessionProviderServices,
} from './types';

const apiUrl =
  process.env.NEXT_PUBLIC_ZEROSPIN_API_URL ||
  process.env.VITE_ZEROSPIN_API_URL ||
  process.env.ZEROSPIN_API_URL ||
  'https://api.zerospin.dev';

const publishableKeyLayer = Layer.effect(
  PublishableKey,
  Effect.fn('makeReactFrontend.publishableKey')(function* () {
    const publishableKey =
      process.env.NEXT_PUBLIC_ZEROSPIN_PUBLISHABLE_KEY ||
      process.env.ZEROSPIN_PUBLISHABLE_KEY ||
      process.env.ZEROSPIN_PUBLISHABLE_KEY;
    if (!publishableKey) {
      return yield* new ZerospinError({
        code: 'missing-zerospin-publishable-key',
        message:
          'Set NEXT_PUBLIC_ZEROSPIN_PUBLISHABLE_KEY or ZEROSPIN_PUBLISHABLE_KEY',
      });
    }
    return Redacted.make(publishableKey);
  })(),
);

const apiUrlLayer = Layer.succeed(ZerospinApisUrl, apiUrl);

export const sessionProviderDefaultLayer: ISessionProviderLayer =
  Layer.mergeAll(
    AsyncLive,
    NanoIdFactory,
    UlidMonotonicFactory,
    apiUrlLayer,
    publishableKeyLayer,
  ).pipe(Layer.provideMerge(Logger.pretty));

export function makeReactFrontend<FRONTEND extends IFrontendController>(props: {
  frontend: FRONTEND;
  isPushPaused?: boolean;
  runtime?: ISessionProviderRuntime;
}): Omit<
  IReactFrontend<FRONTEND>,
  'useCtxOrThrow' | 'useInitializedStateOrThrow'
> {
  const { frontend, isPushPaused = false } = props;

  const sessionRuntime =
    props.runtime ??
    ManagedRuntime.make(
      sessionProviderDefaultLayer satisfies Layer.Layer<
        ISessionProviderServices,
        IAnyError,
        never
      >,
    );

  const ReactContext = createContext<IReactSessionContext<FRONTEND> | null>(
    null,
  );

  const Provider = makeProvider<FRONTEND>({
    ReactContext,
    sessionRuntime,
    frontend,
    isPushPaused,
  });

  const sync = sessionRuntime.runSync.bind(sessionRuntime);

  function makeId<MODEL extends IModel>(
    model: MODEL,
  ): InferIdFromAbbreviation<MODEL['abbreviation']> {
    return sync(makeIdFromAbbreviation({ abbreviation: model.abbreviation }));
  }

  return {
    frontend,
    Provider,
    ReactContext,
    makeId,
    makeModelId: makeId,
    sync,
    sessionRuntime,
  };
}
