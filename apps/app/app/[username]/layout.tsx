"use client";

import { RedirectToSignIn, useAuth, useUser } from "@clerk/react";
import { ZerospinError } from "@zerospin/error";
import { ConnectedAggregateInitializer } from "@zerospin/react";
import { signature } from "@qrk.sh/zerospin/src/signature";
import { Cause, Effect, Exit } from "effect";
import { useEffect, type ComponentProps, type ReactNode } from "react";
import { toast } from "sonner";
import AppError from "@/app/error";
import { getClerkToken } from "@/lib/getClerkToken";
import { startupTiming } from "@/lib/startupTiming";
import workerUrl from "@/zerospin/node.worker?sharedworker&url";
import { userApplicationLayer } from "@/zerospin/userApplicationLayer";
import { userSessionDefinition } from "@/zerospin/userSessionDefinition";
import { UserUI } from "@/zerospin/UserUI";

export default function UserLayout(props: { children: ReactNode }) {
  const { children } = props;
  const { isLoaded, user } = useUser();
  const { getToken } = useAuth();
  useEffect(() => startupTiming.mountUserLayout(), []);
  useEffect(() => {
    if (isLoaded) startupTiming.clerkReady(user !== null && user !== undefined);
  }, [isLoaded, user]);
  if (!isLoaded) return null;
  if (user === null || user === undefined) return <RedirectToSignIn />;

  const clerkUserId = user.id;
  const aggregateId = clerkUserId;
  return (
    <ConnectedAggregateInitializer
      key={clerkUserId}
      definition={userSessionDefinition}
      sharedWorkerUrl={workerUrl}
      credentialsSchema={signature}
      layer={userApplicationLayer}
      renderError={(error) => <UserStartupFailure error={error} />}
      aggregateId={aggregateId}
      expectedClaims={{ aggregateId, clerkUserId }}
      getCredentials={Effect.fn("App.getCredentials")(function* () {
        const acquisition = startupTiming.credentialsStarted();
        const credentials = Effect.gen(function* () {
          const sessionToken = yield* getClerkToken({ getToken });
          if (sessionToken === null) {
            return yield* new ZerospinError({
              code: "user-session-token-unavailable",
              message: "The Clerk session token could not be loaded",
            });
          }
          return { sessionToken };
        });
        if (!import.meta.env.DEV) return yield* credentials;
        return yield* credentials.pipe(
          Effect.withSpan("app.credentials.acquire"),
          Effect.onExit((exit) =>
            Effect.sync(() => {
              startupTiming.credentialsCompleted({
                acquisition,
                outcome: Exit.isSuccess(exit)
                  ? "ready"
                  : Cause.hasInterruptsOnly(exit.cause)
                    ? "cancelled"
                    : "failed",
                ...(Exit.isFailure(exit) ? { error: Cause.squash(exit.cause) } : {}),
              });
            }),
          ),
        );
      })}
    >
      {({ session, isLoaded }) => (
        <>
          <UserStartupDiagnostics session={session} />
          {isLoaded ? (
            <UserUI session={session}>
              <UserSessionFailures />
              {children}
            </UserUI>
          ) : null}
        </>
      )}
    </ConnectedAggregateInitializer>
  );
}

function UserSessionFailures() {
  const session = UserUI.useSession();
  useEffect(() => {
    return session.store.subscribe((state, previous) => {
      if (state.status !== "failed" && state.failure !== null && state.failure !== previous.failure)
        toast.error(state.failure.message);
    });
  }, [session]);
  return null;
}

function UserStartupDiagnostics(props: { session: ComponentProps<typeof UserUI>["session"] }) {
  const { session } = props;
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const observe = () => {
      const state = session.store.getState();
      startupTiming.observeSession({ session, ...state });
    };
    observe();
    return session.store.subscribe(observe);
  }, [session]);
  return null;
}

function UserStartupFailure(props: { error: unknown }) {
  const { error } = props;
  useEffect(() => startupTiming.failed(error), [error]);
  return <AppError error={error} />;
}
