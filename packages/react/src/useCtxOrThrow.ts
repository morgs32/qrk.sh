import { useContext } from 'react';

import type { IFrontendController } from '@zerospin/core/frontendController/types';

import type { IReactFrontend } from './types';

export function useCtxOrThrow<FRONTEND extends IFrontendController>(
  reactFrontend: Pick<IReactFrontend<FRONTEND>, 'ReactContext'>,
): ReturnType<IReactFrontend<FRONTEND>['useCtxOrThrow']> {
  const ctx = useContext(reactFrontend.ReactContext);
  if (ctx === null) {
    throw new Error('useCtxOrThrow must be used within a <Frontend>.Provider');
  }
  return ctx;
}
