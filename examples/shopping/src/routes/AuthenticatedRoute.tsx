import { useUser } from '@clerk/react-router';
import { Effect, Schema } from 'effect';
import { Navigate, Outlet } from 'react-router';

import { RequiredUserProvider } from '@/components/RequiredUser';
import { ClerkUserIdSchema } from '@/zerospin/aggregates/shopper/models/user/userV1';
import { ZerospinApp } from '@/zerospin/ZerospinApp';

export function AuthenticatedRoute() {
  const { user, isLoaded } = useUser();

  if (!isLoaded) {
    return null;
  }

  if (!user) {
    return <Navigate to="/signin" replace />;
  }

  const clerkUserId = Schema.decodeUnknownSync(ClerkUserIdSchema)(user.id);

  return (
    <RequiredUserProvider user={user}>
      <ZerospinApp.Provider
        aggregateIds={{ shopperFrontend: 'acct_1' }}
        generateSignature={() => Effect.succeed({ clerkUserId })}
      >
        <Outlet />
      </ZerospinApp.Provider>
    </RequiredUserProvider>
  );
}
