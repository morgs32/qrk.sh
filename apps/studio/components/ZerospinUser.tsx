"use client";

import { prettyUnknownFailure } from "@zerospin/error";

import { RedirectToSignIn, useAuth, useUser } from "@clerk/nextjs";
import { ZerospinError } from "@zerospin/sdk/browser";
import { Effect } from "effect";
import { useSyncExternalStore, type ReactNode } from "react";
import { UserApp } from "@/zerospin/userSession";

export function useZerospinUserInitializedState() {
  const session = UserApp.useInitializedSession();
  const state = useSyncExternalStore(
    session.store.subscribe,
    session.store.getState,
    session.store.getState,
  );
  if (state.initialized === null) throw new Error("The user session is not initialized");
  return state.initialized;
}

function ZerospinUserInitializedStateProvider(props: { clerkUserId: string; children: ReactNode }) {
  const { clerkUserId, children } = props;
  const { getToken } = useAuth();
  const aggregateId = `acct_${clerkUserId}`;
  return (
    <UserApp.Initializer
      aggregateId={aggregateId}
      expectedClaims={{ aggregateId, clerkUserId }}
      getCredentials={() =>
        Effect.tryPromise({
          try: async () => {
            const sessionToken = await getToken();
            if (sessionToken === null) throw new Error("Clerk did not return a session token");
            return { sessionToken };
          },
          catch: (cause) =>
            new ZerospinError({
              code: "user-session-token-unavailable",
              message: "The Clerk session token could not be loaded",
              cause: prettyUnknownFailure(cause),
            }),
        })
      }
    >
      {children}
    </UserApp.Initializer>
  );
}

export function ZerospinUserProvider(props: { children: ReactNode }) {
  const { children } = props;
  const { isLoaded, user } = useUser();
  // The initializer is cold during SSR; each data reader suspends independently.
  if (isLoaded && user) {
    return (
      <ZerospinUserInitializedStateProvider key={user.id} clerkUserId={user.id}>
        {children}
      </ZerospinUserInitializedStateProvider>
    );
  }
  return (
    <>
      {isLoaded ? <RedirectToSignIn /> : null}
      {children}
    </>
  );
}
