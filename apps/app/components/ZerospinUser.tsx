"use client";

import { RedirectToSignIn, useAuth, useUser } from "@clerk/nextjs";
import { AsyncLive } from "@zerospin/core/async/AsyncLive";
import { PublishableKey } from "@zerospin/core/services/PublishableKey";
import { ZerospinApiUrl } from "@zerospin/core/services/ZerospinApiUrl";
import { NanoIdFactory } from "@zerospin/core/utils/NanoIdFactory";
import { UlidMonotonicFactory } from "@zerospin/core/utils/UlidMonotonicFactory";
import {
  makeZerospinApp,
  useInitializedStateOrThrow,
  useLiveQuery,
  useSession,
} from "@zerospin/react";
import { makeMockProvider } from "@zerospin/react/mock";
import { makeAbbreviationIdSchema } from "@zerospin/schema";
import { makeAggregateId, ZerospinError } from "@zerospin/sdk/browser";
import { Effect, Layer, Redacted, Schema } from "effect";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { userFrontend } from "@qrk.sh/zerospin/src/accounts/user/actors/user/userFrontend";
import { User } from "@qrk.sh/zerospin/src/models/User";
import { signature } from "@qrk.sh/zerospin/src/signature";

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
  authentication: {
    version: "1.0.0",
    signature,
  },
  frontends: {
    web: userFrontend,
  },
  layer: sessionLayer,
});

const MockProvider = makeMockProvider({
  frontend: ZerospinApp.frontends.web,
  layer: sessionLayer,
});

function RequiredZerospinUser(props: {
  children: ReactNode;
  clerkUserId: string;
  displayName: string | null;
  username: string | null;
}) {
  const { children, clerkUserId, displayName, username } = props;
  const { userId } = useInitializedStateOrThrow(ZerospinApp.frontends.web);
  const session = useSession(ZerospinApp.frontends.web);
  const userCreationStarted = useRef(false);
  const [userCreationFailure, setUserCreationFailure] = useState<ZerospinError<string> | null>(
    null,
  );
  const { data: user } = useLiveQuery(ZerospinApp.frontends.web, {
    query: (db) =>
      db.query.user.findFirst({
        where: { clerkUserId: { eq: userId } },
      }),
    deps: [userId],
  });

  useEffect(() => {
    if (user !== undefined || userCreationStarted.current) {
      return;
    }

    userCreationStarted.current = true;
    const result = session.executeCommand({
      contractName: "createUser",
      payload: {
        id: User.prefixId(userId),
        clerkUserId,
        username,
        displayName,
      },
    });

    if (result._tag === "Failure") {
      setUserCreationFailure(new ZerospinError(result.failure));
    }
  }, [clerkUserId, displayName, session, user, userId, username]);

  if (userCreationFailure !== null) {
    throw userCreationFailure;
  }

  return user === undefined ? null : children;
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
    <ZerospinApp.Provider
      key={user.id}
      aggregateIds={{ web: makeAggregateId({ id: user.id }) }}
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
      <RequiredZerospinUser
        clerkUserId={user.id}
        username={user.username}
        displayName={user.fullName}
      >
        {children}
      </RequiredZerospinUser>
    </ZerospinApp.Provider>
  );
}

export function MockZerospinUserProvider({ children }: { children: ReactNode }) {
  const userId = "mock-user";
  const actorId = Schema.decodeUnknownSync(makeAbbreviationIdSchema("actr"))(`actr_${userId}`);

  return (
    <MockProvider
      aggregateIds={{ web: makeAggregateId({ id: userId }) }}
      generateSignature={() => Effect.succeed({ sessionToken: "mock-session-token" })}
      userId={userId}
      resources={{
        user: [
          {
            id: User.prefixId(userId),
            modelName: User.modelName,
            version: User.version,
            createdAt: new Date("2026-01-01T00:00:00.000Z"),
            updatedAt: new Date("2026-01-01T00:00:00.000Z"),
            actorId,
            clerkUserId: userId,
            username: "mock-user",
            displayName: "Mock User",
          },
        ],
      }}
    >
      {children}
    </MockProvider>
  );
}
