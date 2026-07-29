'use client';

import { type ReactNode } from 'react';

import { useUser } from '@clerk/nextjs';
import { ZerospinConfig } from '@zerospin/react/ZerospinConfig';
import { Effect } from 'effect';

import { AppDevtools } from './AppDevtools';
import { RequiredUserProvider } from './RequiredUser';
import { ZerospinOwner, ZerospinProviderAdmin } from './ZerospinParking';

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
        frontendAuthenticators={{
          'provider-admin': {
            frontend: ZerospinProviderAdmin,
            generateSignature: () =>
              Effect.succeed({ clerkUserId: user.id }),
          },
          owner: {
            frontend: ZerospinOwner,
            generateSignature: () =>
              Effect.succeed({ clerkUserId: user.id }),
          },
        }}
      >
        <ZerospinProviderAdmin.Provider>
          <ZerospinOwner.Provider>
            {children}
            <AppDevtools />
          </ZerospinOwner.Provider>
        </ZerospinProviderAdmin.Provider>
      </ZerospinConfig>
    </RequiredUserProvider>
  );
}
