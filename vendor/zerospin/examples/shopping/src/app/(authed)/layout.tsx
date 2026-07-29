'use client';

import { type ReactNode } from 'react';

import { useUser } from '@clerk/nextjs';
import { ZerospinConfig } from '@zerospin/react/ZerospinConfig';
import { Effect } from 'effect';

import { RequiredUserProvider } from './RequiredUser';
import { ZerospinCatalog } from './ZerospinCatalog';
import { ZerospinShopper } from './ZerospinShopper';

export default function AuthedLayout({ children }: { children: ReactNode }) {
  const { user, isLoaded } = useUser();

  if (!isLoaded) {
    return null; // Because we're using the proxy to protect the route, we don't have to check for isAuthenticated
  }

  if (!user) {
    throw new Error('User not found in (authed) layout');
  }

  return (
    <RequiredUserProvider user={user}>
      <ZerospinConfig
        partitionKey={user.id}
        isSharedWorkerEnabled
        frontendAuthenticators={{
          web: {
            frontend: ZerospinShopper,
            generateSignature: () =>
              Effect.succeed({ clerkUserId: user.id }),
          },
          catalog: {
            frontend: ZerospinCatalog,
            generateSignature: () => Effect.succeed({ viewerId: user.id }),
          },
        }}
      >
        <ZerospinShopper.Provider>
          <ZerospinCatalog.Provider>
            {children}
          </ZerospinCatalog.Provider>
        </ZerospinShopper.Provider>
      </ZerospinConfig>
    </RequiredUserProvider>
  );
}
