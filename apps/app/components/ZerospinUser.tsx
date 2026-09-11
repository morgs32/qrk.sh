"use client";

import { RedirectToSignIn, useAuth, useUser } from "@clerk/nextjs";
import { AsyncLive } from "@zerospin/core/async/AsyncLive";
import { PublishableKey } from "@zerospin/core/services/PublishableKey";
import { ZerospinApiUrl } from "@zerospin/core/services/ZerospinApiUrl";
import { NanoIdFactory } from "@zerospin/core/utils/NanoIdFactory";
import { UlidMonotonicFactory } from "@zerospin/core/utils/UlidMonotonicFactory";
import { checkZerospinApp, makeZerospinApp } from "@zerospin/react";
import { ZerospinError } from "@zerospin/sdk/browser";
import { Effect, Layer, Redacted } from "effect";
import type { ReactNode } from "react";

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

export const ZerospinApp = makeZerospinApp({
  systemName: "qrk-sh",
  frontends: {
    web: userFrontend,
  },
  layer: sessionLayer,
});

checkZerospinApp<typeof system>(ZerospinApp);

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
    <ZerospinApp.Provider
      key={user.id}
      generateSignature={{
        web: () =>
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
          }),
      }}
    >
      {children}
    </ZerospinApp.Provider>
  );
}
