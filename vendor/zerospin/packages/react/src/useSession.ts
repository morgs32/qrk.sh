import type { IFrontendController } from '@zerospin/core/frontendController/types';

import type { IBrowserSession, IReactFrontend } from './types';
import { useCtxOrThrow } from './useCtxOrThrow';

export function useSession<FRONTEND extends IFrontendController>(
  reactFrontend: Pick<IReactFrontend<FRONTEND>, 'ReactContext'>,
): IBrowserSession<FRONTEND> {
  return useCtxOrThrow(reactFrontend).session;
}
