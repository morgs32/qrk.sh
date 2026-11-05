"use client";

import { RedirectToSignIn, useAuth, useUser } from "@clerk/react";
import { ZerospinError } from "@zerospin/error";
import {
  SessionProvider,
  SessionReady,
  useConnectedAggregateSession,
  useConnectedServiceSession,
  useSession,
} from "@zerospin/react";
import { signature } from "@qrk.sh/zerospin/src/signature";
import {
  receivingAccountId,
  receivingUsername,
} from "@qrk.sh/zerospin/src/services/instagramVerification/instagramVerificationPolicy";
import { Cause, Effect, Exit } from "effect";
import { useEffect, type ReactNode } from "react";
import { toast } from "sonner";
import AppError from "@/app/error";
import { getClerkToken } from "@/lib/getClerkToken";
import { startupTiming } from "@/lib/startupTiming";
import workerUrl from "@/zerospin/node.worker?sharedworker&url";
import instagramVerificationWorkerUrl from "@/zerospin/instagramVerification.worker?sharedworker&url";
import { instagramVerificationSessionDefinition } from "@/zerospin/instagramVerificationSessionDefinition";
import { userApplicationLayer } from "@/zerospin/userApplicationLayer";
import { userSessionDefinition } from "@/zerospin/userSessionDefinition";

export default function UserLayout(props: { children: ReactNode }) {
  const { children } = props;
  const { isLoaded, user } = useUser();
  const { getToken } = useAuth();
  const session = useConnectedAggregateSession(
    userSessionDefinition,
    () => {
      if (!isLoaded || user === null || user === undefined) return null;
      const clerkUserId = user.id;
      const aggregateId = clerkUserId;
      return {
        sharedWorkerUrl: workerUrl,
        credentialsSchema: signature,
        layer: userApplicationLayer,
        aggregateId,
        expectedClaims: { aggregateId, clerkUserId },
        getCredentials: Effect.fn("App.getCredentials")(function* () {
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
        }),
      };
    },
    { onFailure: (error) => toast.error(error.message) },
  );
  const instagramVerificationSession = useConnectedServiceSession(
    instagramVerificationSessionDefinition,
    () => {
      if (
        !isLoaded ||
        user === null ||
        user === undefined ||
        !receivingAccountId ||
        !receivingUsername
      )
        return null;
      return {
        sharedWorkerUrl: instagramVerificationWorkerUrl,
        credentialsSchema: signature,
        layer: userApplicationLayer,
        expectedClaims: { clerkUserId: user.id },
        getCredentials: Effect.fn("App.instagramVerification.getCredentials")(function* () {
          const sessionToken = yield* getClerkToken({ getToken });
          if (sessionToken === null) {
            return yield* new ZerospinError({
              code: "instagram-verification-session-token-unavailable",
              message: "The Clerk session token could not be loaded",
            });
          }
          return { sessionToken };
        }),
      };
    },
    { onFailure: (error) => toast.error(error.message) },
  );
  useEffect(() => startupTiming.mountUserLayout(), []);
  useEffect(() => {
    if (isLoaded) startupTiming.clerkReady(user !== null && user !== undefined);
  }, [isLoaded, user]);
  if (!isLoaded) return null;
  if (user === null || user === undefined) return <RedirectToSignIn />;

  return (
    <SessionProvider session={session}>
      <SessionProvider session={instagramVerificationSession}>
        <SessionReady
          definition={userSessionDefinition}
          renderError={(error, retry) => <UserStartupFailure error={error} retry={retry} />}
        >
          <UserStartupDiagnostics />
          {children}
        </SessionReady>
      </SessionProvider>
    </SessionProvider>
  );
}

function UserStartupDiagnostics() {
  const session = useSession(userSessionDefinition);
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

function UserStartupFailure(props: { error: unknown; retry: () => void }) {
  const { error, retry } = props;
  useEffect(() => startupTiming.failed(error), [error]);
  return <AppError error={error} retry={retry} />;
}
