"use client";

import { makeAggregateId } from "@zerospin/core/utils/make/makeAggregateId";
import { prettyUnknownFailure } from "@zerospin/error";

import { RedirectToSignIn, useAuth, useUser } from "@clerk/nextjs";
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

function ZerospinUserInitializedStateProvider(props: { clerkUserId: string }) {
  const { clerkUserId } = props;
  const { getToken } = useAuth();
  useInitializeSession({
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
    if (process.env.NODE_ENV !== "development") return;
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
  return null;
}

export function ZerospinUserProvider(props: { children: ReactNode }) {
  const { children } = props;
  const { isLoaded, user } = useUser();
  // Initialization is a sibling: the server-rendered shell never waits on SQLite.
  return (
    <>
      {isLoaded && user ? (
        <ZerospinUserInitializedStateProvider key={user.id} clerkUserId={user.id} />
      ) : isLoaded ? (
        <RedirectToSignIn />
      ) : null}
      {children}
    </>
  );
}
