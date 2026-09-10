import { useContext } from 'react';

import type {
  IAggregateFrontendController,
  IAnyFrontendController,
  IServiceFrontendController,
} from '@zerospin/core/frontendController/types';
import type { IAnyModels } from '@zerospin/core/models/types';

import type { IBrowserServiceSession, IBrowserSession } from './types';
import { ZerospinProviderContext } from './ZerospinProviderContext';

export function useSession<
  FRONTEND extends IAggregateFrontendController,
  MODELS extends IAnyModels,
>(
  selector: Readonly<{
    frontend: FRONTEND;
    models: MODELS;
  }>,
): IBrowserSession<FRONTEND>;
export function useSession<
  FRONTEND extends IServiceFrontendController,
  MODELS extends IAnyModels,
>(
  selector: Readonly<{ frontend: FRONTEND; models: MODELS }>,
): IBrowserServiceSession<FRONTEND, MODELS>;
export function useSession(
  selector: Readonly<{
    frontend: IAnyFrontendController | IServiceFrontendController;
    models: IAnyModels;
  }>,
): object {
  const provider = useContext(ZerospinProviderContext);
  if (provider === null) {
    throw new Error('useSession must be used within ZerospinApp.Provider.');
  }
  const entry = provider.sessions.get(selector);
  if (entry === undefined) {
    throw new Error(
      `ZerospinApp.Provider has no mounted session for frontend "${selector.frontend.name}". Use the matching ZerospinApp.frontends entry.`,
    );
  }
  return entry.session;
}
