import type { IFrontendController } from '@zerospin/core/frontendController/types';
import type { ISession } from '@zerospin/core/session/types';

import type { IBrowserPartitionController } from './makeBrowserPartitionController';
import type { IBrowserSession } from './types';

export function makeBrowserSession<
  FRONTEND extends IFrontendController,
>(props: {
  session: ISession<FRONTEND>;
  browserPartitionController: IBrowserPartitionController;
  onCommandStaged?: () => void;
}): IBrowserSession<FRONTEND> {
  const { browserPartitionController, onCommandStaged, session } = props;

  return {
    browserPartitionController,
    coreSession: session,
    frontend: session.frontend,
    onInitialized: session.onInitialized,
    sessionId: session.sessionId,
    async stageCommand(stageProps) {
      const result = await session.stageCommand(stageProps);
      if (result._tag === 'Right') {
        onCommandStaged?.();
      }
      return result;
    },
    store: session.store,
  };
}
