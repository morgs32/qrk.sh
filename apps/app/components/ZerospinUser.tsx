"use client";

import { RedirectToSignIn, useAuth, useUser } from "@clerk/react";
import { ZerospinError } from "@zerospin/error";
import { Effect } from "effect";
import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { getClerkToken } from "@/lib/getClerkToken";
import { toast } from "sonner";
import { Initializer } from "@zerospin/react";
import { userConnection } from "@/zerospin/userConnection";
import { userSessionDefinition } from "@/zerospin/userSessionDefinition";
import { UserUI } from "@/zerospin/UserUI";
import AppError from "@/app/error";

export function useZerospinUserInitializedState() {
  const session = UserUI.useSession();
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
  const aggregateId = clerkUserId;
  return (
    <Initializer
      definition={userSessionDefinition}
      connection={userConnection}
      renderError={(error) => <AppError error={error} />}
      aggregateId={aggregateId}
      expectedClaims={{ aggregateId, clerkUserId }}
      getCredentials={Effect.fn("App.getCredentials")(function* () {
        const sessionToken = yield* getClerkToken({ getToken });
        if (sessionToken === null) {
          return yield* new ZerospinError({
            code: "user-session-token-unavailable",
            message: "The Clerk session token could not be loaded",
          });
        }
        return { sessionToken };
      })}
    >
      {({ session, isLoaded }) =>
        isLoaded ? (
          <UserUI session={session}>
            <UserSessionFailures />
            {children}
          </UserUI>
        ) : null
      }
    </Initializer>
  );
}

export function ZerospinUserProvider(props: { children: ReactNode }) {
  const { children } = props;
  const { isLoaded, user } = useUser();
  // The initializer is cold during SSR; its callback gates session-dependent content.
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

function UserSessionFailures() {
  const session = UserUI.useSession();
  useEffect(() => {
    const stopFailures = session.store.subscribe((state, previous) => {
      if (state.status !== "failed" && state.failure !== null && state.failure !== previous.failure)
        toast.error(state.failure.message);
    });
    return () => {
      stopFailures();
    };
  }, [session]);
  return null;
}
