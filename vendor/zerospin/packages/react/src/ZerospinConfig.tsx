import { useMemo, type ReactNode } from 'react';

import {
  BrowserUserControllerContext,
  makeBrowserUserController,
} from './makeBrowserUserController';

export function ZerospinConfig(props: {
  userId: string;
  isSharedWorkerEnabled?: boolean;
  children: ReactNode;
}) {
  const { children, userId, isSharedWorkerEnabled = false } = props;

  const browserUserController = useMemo(
    () => makeBrowserUserController(userId, isSharedWorkerEnabled),
    [userId, isSharedWorkerEnabled],
  );

  return (
    <BrowserUserControllerContext.Provider value={browserUserController}>
      {children}
    </BrowserUserControllerContext.Provider>
  );
}
