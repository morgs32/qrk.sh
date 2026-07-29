"use client";

import { RedirectToSignIn, useUser } from "@clerk/nextjs";
import { makeReactFrontend } from "@zerospin/react/makeReactFrontend";
import { makeMockProvider } from "@zerospin/react/mock";
import { prefixActorId } from "@zerospin/core/utils/prefixActorId";

import { userFrontend } from "@qrk.sh/zerospin/src/accounts/user/actors/user/userFrontend";
import { User } from "@qrk.sh/zerospin/src/models/User";

/** One mocked user session shared by the dashboard and every nested site route. */
export const ZerospinUser = makeReactFrontend({
  frontend: userFrontend,
});

const MockZerospinUserProvider = makeMockProvider({
  reactFrontend: ZerospinUser,
});

export function ZerospinUserProvider({ children }: { children: React.ReactNode }) {
  const { isLoaded, user } = useUser();

  if (!isLoaded) {
    return null;
  }

  if (!user) {
    return <RedirectToSignIn />;
  }

  const actorId = prefixActorId(user.id);

  return (
    <MockZerospinUserProvider
      key={user.id}
      partitionKey={user.id}
      accountId="acct_mock_user"
      actorId={actorId}
      generationId="gen_mock_user"
      systemVersion={userFrontend.version}
      systemWorkerName="mock-user-worker"
      resources={{
        user: [
          {
            id: User.prefixId(user.id),
            modelName: User.modelName,
            version: User.version,
            createdAt: new Date("2026-01-01T00:00:00.000Z"),
            updatedAt: new Date("2026-01-01T00:00:00.000Z"),
            actorId,
            clerkUserId: user.id,
            username: user.username,
            displayName: user.fullName,
          },
        ],
      }}
    >
      {children}
    </MockZerospinUserProvider>
  );
}
