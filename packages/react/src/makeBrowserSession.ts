import type { IAggregateFrontendController } from '@zerospin/core/frontendController/types';
import type { ISession } from '@zerospin/core/session/types';

import type { IBrowserSession } from './types';

export function makeBrowserSession<
  FRONTEND extends IAggregateFrontendController,
>(props: {
  session: ISession<FRONTEND>;
  onCommandExecuted?: () => void;
}): IBrowserSession<FRONTEND> {
  const { onCommandExecuted, session } = props;

  return {
    coreSession: session,
    frontend: session.frontend,
    onInitialized: session.onInitialized,
    get sessionId() {
      return session.sessionId;
    },
    executeCommand(executeProps) {
      const result = session.executeCommand(executeProps);
      if (result._tag === 'Success') {
        onCommandExecuted?.();
      }
      return result;
    },
    store: session.store,
  };
}
