import { useUser } from '@clerk/react-router';
import { useInitializeSession } from '@zerospin/react';
import { Effect, Schema } from 'effect';
import type { ReactNode } from 'react';
import { Navigate, Outlet } from 'react-router';

import { RequiredUserProvider } from '@/components/RequiredUser';
import { ClerkUserIdSchema } from '@/zerospin/aggregates/shopper/models/user/UserV1';
import type { system } from '@/zerospin/system';
import {
  catalogSession,
  shopperSession,
} from '@/zerospin/ZerospinApp';

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
      <ZerospinSessions key={user.id} clerkUserId={clerkUserId}>
        <Outlet />
      </ZerospinSessions>
    </RequiredUserProvider>
  );
}

function ZerospinSessions(props: {
  clerkUserId: typeof ClerkUserIdSchema.Type;
  children: ReactNode;
}) {
  const { clerkUserId, children } = props;
  const generateSignature = () => Effect.succeed({ clerkUserId });

  // Mount both initialization hooks before the loading gate.
  const shopper = useInitializeSession<typeof system>({
    session: shopperSession,
    generateSignature,
  });
  const catalog = useInitializeSession<typeof system>({
    session: catalogSession,
    generateSignature,
  });

  if (!shopper.isInitialized || !catalog.isInitialized) {
    return null;
  }

  return children;
}
