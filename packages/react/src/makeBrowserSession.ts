import type { IFrontendController } from '@zerospin/core/frontendController/types';
import type { ISession } from '@zerospin/core/session/types';

import type { IBrowserUserController } from './makeBrowserUserController';
import type { IBrowserSession } from './types';

export function makeBrowserSession<
  FRONTEND extends IFrontendController,
>(props: {
  session: ISession<FRONTEND>;
  browserUserController: IBrowserUserController;
}): IBrowserSession<FRONTEND> {
  const { browserUserController, session } = props;

  return {
    browserUserController,
    coreSession: session,
    frontend: session.frontend,
    onInitialized: session.onInitialized,
    pushQueue: session.pushQueue,
    pushStagedCommands: () => session.pushStagedCommands(),
    sessionId: session.sessionId,
    stageCommand(stageProps) {
      return session.stageCommand(stageProps);
    },
    store: session.store,
  };
}
