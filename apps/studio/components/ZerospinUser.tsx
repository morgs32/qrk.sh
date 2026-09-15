"use client";

import { RedirectToSignIn, useAuth, useUser } from "@clerk/react";
import { AsyncLive } from "@zerospin/core/async/AsyncLive";
import { PublishableKey } from "@zerospin/core/services/PublishableKey";
import { ZerospinApiUrl } from "@zerospin/core/services/ZerospinApiUrl";
import { NanoIdFactory } from "@zerospin/core/utils/NanoIdFactory";
import { UlidMonotonicFactory } from "@zerospin/core/utils/UlidMonotonicFactory";
import { makeZerospinApp, useInitializedStateOrThrow } from "@zerospin/react";
import { ZerospinError } from "@zerospin/sdk/browser";
import { Effect, Layer, Redacted } from "effect";
import { createContext, useContext, type ReactNode } from "react";

import { userFrontend } from "@qrk.sh/zerospin/src/aggregates/user/userFrontend";
import type { system } from "@qrk.sh/zerospin/src/system";

const zerospinApiUrl = process.env.NEXT_PUBLIC_ZEROSPIN_API_URL;
const zerospinPublishableKey = process.env.NEXT_PUBLIC_ZEROSPIN_PUBLISHABLE_KEY;

if (!zerospinApiUrl) {
  throw new Error("NEXT_PUBLIC_ZEROSPIN_API_URL is required for the app.");
}

if (!zerospinPublishableKey) {
  throw new Error("NEXT_PUBLIC_ZEROSPIN_PUBLISHABLE_KEY is required for the app.");
}

const sessionLayer = Layer.mergeAll(
  AsyncLive,
  NanoIdFactory,
  UlidMonotonicFactory,
  Layer.succeed(ZerospinApiUrl, zerospinApiUrl),
  Layer.succeed(PublishableKey, Redacted.make(zerospinPublishableKey)),
);

export const ZerospinApp = makeZerospinApp<typeof system>({
  systemName: "qrk-sh",
  layer: sessionLayer,
  devtools: {
    load: import.meta.env.DEV,
    defaultOpen: false,
  },
});

export const ZerospinUser = ZerospinApp.makeFrontend(userFrontend);

const ZerospinUserInitializedStateContext = createContext<null | {
  readonly db: ReturnType<typeof useZerospinUserInitializedStateFromFrontend>["db"];
}>(null);

function useZerospinUserInitializedStateFromFrontend(frontend: typeof ZerospinUser) {
  return useInitializedStateOrThrow(frontend);
}

function ZerospinUserInitializedStateProvider(props: {
  frontend: typeof ZerospinUser;
  children: ReactNode;
}) {
  const state = useZerospinUserInitializedStateFromFrontend(props.frontend);
  return (
    <ZerospinUserInitializedStateContext.Provider value={state}>
      {props.children}
    </ZerospinUserInitializedStateContext.Provider>
  );
}

export function useZerospinUserInitializedState() {
  const state = useContext(ZerospinUserInitializedStateContext);
  if (state === null) {
    throw new Error("useZerospinUserInitializedState must be used within ZerospinUserProvider");
  }
  return state;
}

export function ZerospinUserProvider({ children }: { children: ReactNode }) {
  const { getToken } = useAuth();
  const { isLoaded, user } = useUser();

  if (!isLoaded) {
    return null;
  }

  if (!user) {
    return <RedirectToSignIn />;
  }

  return (
    <ZerospinApp.Provider>
      <ZerospinUser
        key={user.id}
        generateSignature={() =>
          Effect.tryPromise({
            try: async () => {
              const sessionToken = await getToken();
              if (sessionToken === null) {
                throw new Error("Clerk did not return a session token");
              }
              return { sessionToken };
            },
            catch: (cause) =>
              new ZerospinError({
                code: "user-session-token-unavailable",
                message: "The Clerk session token could not be loaded",
                cause: ZerospinError.prettyUnknownFailure(cause),
              }),
          })
        }
      >
        <ZerospinUserInitializedStateProvider frontend={ZerospinUser}>
          {children}
        </ZerospinUserInitializedStateProvider>
      </ZerospinUser>
    </ZerospinApp.Provider>
  );
}
