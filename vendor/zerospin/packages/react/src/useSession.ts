import { useContext } from 'react';

import type {
  IAggregateFrontendController,
  IFrontendController,
  IServiceFrontendController,
} from '@zerospin/core/frontendController/types';

import type { IBrowserServiceSession, IBrowserSession } from './types';
import { ZerospinProviderContext } from './ZerospinProviderContext';

export function useSession<FRONTEND extends IAggregateFrontendController>(
  selector: Readonly<{ frontend: FRONTEND }>,
): IBrowserSession<FRONTEND>;
export function useSession<FRONTEND extends IServiceFrontendController>(
  selector: Readonly<{ frontend: FRONTEND }>,
): IBrowserServiceSession<FRONTEND>;
export function useSession(
  selector: Readonly<{
    frontend: IFrontendController | IServiceFrontendController;
  }>,
): object {
  const provider = useContext(ZerospinProviderContext);
  if (provider === null) {
    throw new Error('useSession must be used within ZerospinApp.Provider.');
  }
  const entry = provider.sessions.get(selector);
  if (entry === undefined) {
    throw new Error(
      `ZerospinApp.Provider has no mounted session for frontend "${selector.frontend.frontendName}". Use the matching ZerospinApp.frontends entry.`,
    );
  }
  return entry.session;
}
