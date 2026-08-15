import type { IAggregateFrontendController } from '@zerospin/core/frontendController/types';
import type { ISession } from '@zerospin/core/session/types';

import type { IBrowserSession } from './types';

export function makeBrowserSession<
  FRONTEND extends IAggregateFrontendController,
>(props: {
  session: ISession<FRONTEND>;
  onCommandStaged?: () => void;
}): IBrowserSession<FRONTEND> {
  const { onCommandStaged, session } = props;

  return {
    coreSession: session,
    frontend: session.frontend,
    onInitialized: session.onInitialized,
    sessionId: session.sessionId,
    stageCommand(stageProps) {
      const result = session.stageCommand(stageProps);
      if (result._tag === 'Right') {
        onCommandStaged?.();
      }
      return result;
    },
    store: session.store,
  };
}
