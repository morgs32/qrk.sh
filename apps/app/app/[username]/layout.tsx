"use client";

import { RedirectToSignIn, useAuth, useUser } from "@clerk/react";
import { ZerospinError } from "@zerospin/error";
import { ConnectedAggregateInitializer } from "@zerospin/react";
import { makeApplicationSharedWorker } from "@zerospin/browser/makeApplicationSharedWorker";
import { signature } from "@qrk.sh/zerospin/src/signature";
import { Effect } from "effect";
import { useEffect, type ReactNode } from "react";
import { toast } from "sonner";
import AppError from "@/app/error";
import { getClerkToken } from "@/lib/getClerkToken";
import workerUrl from "@/zerospin/node.worker?sharedworker&url";
import { userApplicationLayer } from "@/zerospin/userApplicationLayer";
import { userSessionDefinition } from "@/zerospin/userSessionDefinition";
import { UserUI } from "@/zerospin/UserUI";

export default function UserLayout(props: { children: ReactNode }) {
  const { children } = props;
  const { isLoaded, user } = useUser();
  const { getToken } = useAuth();
  if (!isLoaded) return null;
  if (user === null || user === undefined) return <RedirectToSignIn />;

  const clerkUserId = user.id;
  const aggregateId = clerkUserId;
  return (
    <ConnectedAggregateInitializer
      key={clerkUserId}
      definition={userSessionDefinition}
      sharedWorker={userSharedWorker}
      credentialsSchema={signature}
      layer={userApplicationLayer}
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

function userSharedWorker(props: { name: string }) {
  const { name } = props;
  return makeApplicationSharedWorker(workerUrl, { name });
}
