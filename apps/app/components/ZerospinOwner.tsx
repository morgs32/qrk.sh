"use client";

import { RedirectToSignIn, useAuth, useUser } from "@clerk/nextjs";
import { ZerospinDevtools } from "@zerospin/devtools/ZerospinDevtools";
import { ZerospinError } from "@zerospin/error";
import { ZerospinConfig } from "@zerospin/react/ZerospinConfig";
import { makeReactFrontend } from "@zerospin/react/makeReactFrontend";
import { Effect } from "effect";

import { ownerFrontend } from "@qrk.sh/zerospin/src/ownerFrontend";

/** One paused browser session shared by the authenticated dashboard and site surfaces. */
export const ZerospinUser = makeReactFrontend({
  frontend: ownerFrontend,
  isPushPaused: true,
});

export function ZerospinUserProvider({ children }: { children: React.ReactNode }) {
  const { getToken } = useAuth();
  const { isLoaded, user } = useUser();

  if (!isLoaded) {
    return null;
  }

  if (!user) {
    return <RedirectToSignIn />;
  }

  return (
    <ZerospinConfig userId={user.id}>
      <ZerospinUser.Provider
        key={user.id}
        generateSignature={() =>
          Effect.tryPromise({
            try: async () => {
              const sessionToken = await getToken();
              if (sessionToken === null) {
                throw new Error("Clerk returned no session token for the signed-in owner");
              }
              return { sessionToken };
            },
            catch: (cause) =>
              new ZerospinError({
                code: "clerk-session-token-unavailable",
                message: "Could not create the Zerospin owner signature",
                cause: ZerospinError.prettyUnknownFailure(cause),
              }),
          })
        }
      >
        {children}
        <ZerospinDevtools
          config={{
            defaultOpen: true,
            position: "bottom-right",
            theme: "light",
          }}
        />
      </ZerospinUser.Provider>
    </ZerospinConfig>
  );
}
