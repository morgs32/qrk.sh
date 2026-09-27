"use client";

import { makeAggregateId } from "@zerospin/core/utils/make/makeAggregateId";
import { prettyUnknownFailure } from "@zerospin/error";

import { RedirectToSignIn, useAuth, useUser } from "@clerk/react";
import { loadDevtools, useInitializeSession } from "@zerospin/react";
import { ZerospinError } from "@zerospin/sdk/browser";
import { Effect } from "effect";
import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { userSession } from "@/zerospin/userSession";

export function useZerospinUserInitializedState() {
  const state = useSyncExternalStore(
    userSession.store.subscribe,
    userSession.store.getState,
    userSession.store.getState,
  );
  if (!state.isInitialized) throw new Error("The user session is not initialized");
  return state;
}

function ZerospinUserInitializedStateProvider({
  children,
  clerkUserId,
}: {
  children: ReactNode;
  clerkUserId: string;
}) {
  const { getToken } = useAuth();
  const { isInitialized } = useInitializeSession({
    session: userSession,
    expectedClaims: {
      aggregateId: makeAggregateId({ id: clerkUserId }),
      clerkUserId,
    },
    getCredentials: () =>
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
      }),
  });
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    let disposed = false;
    let dispose: (() => void) | undefined;
    void loadDevtools({ defaultOpen: false })
      .then((devtools) => {
        if (disposed) devtools.dispose();
        else dispose = devtools.dispose;
      })
      .catch(console.error);
    return () => {
      disposed = true;
      dispose?.();
    };
  }, []);
  return isInitialized ? children : null;
}

export function ZerospinUserProvider({ children }: { children: ReactNode }) {
  const { isLoaded, user } = useUser();
  if (!isLoaded) return null;
  if (!user) return <RedirectToSignIn />;
  return (
    <ZerospinUserInitializedStateProvider key={user.id} clerkUserId={user.id}>
      {children}
    </ZerospinUserInitializedStateProvider>
  );
}
