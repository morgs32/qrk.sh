import type { IFrontendController } from '@zerospin/core/frontendController/types';
import type { ISession } from '@zerospin/core/session/types';

import type { IBrowserUserController } from './makeBrowserUserController';
import type { IBrowserSession } from './types';

export function makeBrowserSession<
  FRONTEND extends IFrontendController,
>(props: {
  session: ISession<FRONTEND>;
  browserUserController: IBrowserUserController;
  onCommandStaged?: () => void;
}): IBrowserSession<FRONTEND> {
  const { browserUserController, onCommandStaged, session } = props;

  return {
    browserUserController,
    coreSession: session,
    frontend: session.frontend,
    generateSignature: session.generateSignature,
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
