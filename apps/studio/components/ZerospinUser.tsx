"use client";

import { RedirectToSignIn, useAuth, useUser } from "@clerk/nextjs";
import { ZerospinError } from "@zerospin/error";
import { Effect } from "effect";
import { Suspense, useEffect, useSyncExternalStore, type ReactNode } from "react";
import { getClerkToken } from "@/lib/getClerkToken";
import { toast } from "sonner";
import { FigmaReadyMeasurements } from "@qrk.sh/library/FigmaReadyMeasurements";
import { startLibrarySessionWork } from "@qrk.sh/library/startLibrarySessionWork";
import { UserApp } from "@/zerospin/userSession";
import StudioError from "@/app/error";

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
  const aggregateId = clerkUserId;
  return (
    <UserApp.Initializer
      renderError={(error) => <StudioError error={error} />}
      aggregateId={aggregateId}
      expectedClaims={{ aggregateId, clerkUserId }}
      getCredentials={Effect.fn("Studio.getCredentials")(function* () {
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
      <Suspense fallback={null}>
        <UserSessionWork>{children}</UserSessionWork>
      </Suspense>
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

function UserSessionWork(props: { children: ReactNode }) {
  const { children } = props;
  const session = UserApp.useInitializedSession();
  const initialized = useSyncExternalStore(
    session.store.subscribe,
    () => session.store.getState().initialized,
    () => session.store.getState().initialized,
  );
  useEffect(() => {
    const stopWork = startLibrarySessionWork(session);
    const stopFailures = session.store.subscribe((state, previous) => {
      if (state.status !== "failed" && state.failure !== null && state.failure !== previous.failure)
        toast.error(state.failure.message);
    });
    return () => {
      stopWork();
      stopFailures();
    };
  }, [session, initialized?.db]);
  return (
    <>
      <FigmaReadyMeasurements session={session} />
      {children}
    </>
  );
}
