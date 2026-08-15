import { createContext, type ReactNode } from 'react';

import { type useUser } from '@clerk/react-router';

const RequiredUserContext = createContext<
  NonNullable<ReturnType<typeof useUser>['user']>
>(undefined!);

export function RequiredUserProvider(props: {
  children: ReactNode;
  user: NonNullable<ReturnType<typeof useUser>['user']>;
}) {
  const { children, user } = props;

  return (
    <RequiredUserContext.Provider value={user}>
      {children}
    </RequiredUserContext.Provider>
  );
}
