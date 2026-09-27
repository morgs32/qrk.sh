import type { ReactNode } from 'react';

import { useAuth, useUser } from '@clerk/react-router';
import { makeZerospinError } from '@zerospin/error';
import { useInitializeSession } from '@zerospin/react';
import { Effect } from 'effect';
import { Navigate, Outlet } from 'react-router';

import { RequiredUserProvider } from '@/components/RequiredUser';
import { catalogSession } from '@/zerospin/catalogSession';
import { shopperSession } from '@/zerospin/shopperSession';

export function AuthenticatedRoute() {
  const { user, isLoaded } = useUser();

  if (!isLoaded) {
    return null;
  }

  if (!user) {
    return <Navigate to="/signin" replace />;
  }

  return (
    <RequiredUserProvider user={user}>
      <ZerospinSessions key={user.id}>
        <Outlet />
      </ZerospinSessions>
    </RequiredUserProvider>
  );
}

function ZerospinSessions(props: { children: ReactNode }) {
  const { children } = props;
  const { getToken } = useAuth();
  const getCredentials = () =>
    Effect.tryPromise({
      try: () => getToken(),
      catch: () => makeZerospinError('clerk-session-unavailable'),
    }).pipe(
      Effect.flatMap(token =>
        token === null
          ? Effect.fail(makeZerospinError('clerk-session-unavailable'))
          : Effect.succeed({ token }),
      ),
    );

  // Mount both initialization hooks before the loading gate.
  const shopper = useInitializeSession({
    session: shopperSession,
    getCredentials,
  });
  const catalog = useInitializeSession({
    session: catalogSession,
    getCredentials,
  });

  if (!shopper.isInitialized || !catalog.isInitialized) {
    return null;
  }

  return children;
}
