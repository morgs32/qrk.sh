"use client";

import { Schema } from "effect";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useInitializedStateOrThrow, useSession } from "@zerospin/react";
import { ZerospinError } from "@zerospin/sdk/browser";

import { User } from "@qrk.sh/zerospin/src/models/User";

import { Button } from "@/components/ui/button";
import { ZerospinApp } from "@/components/ZerospinUser";
import { useValidatedParams } from "@/hooks/useValidatedParams";

import { Header } from "./Header";

const ParamsSchema = Schema.Struct({
  username: Schema.String,
});

export default function UsernameDashboardPage() {
  const { username } = useValidatedParams(ParamsSchema);
  const router = useRouter();
  const session = useSession(ZerospinApp.frontends.web);
  const { userId } = useInitializedStateOrThrow(ZerospinApp.frontends.web);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="mt-16 flex-1 p-6">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-6">
          <div className="flex items-center justify-between gap-3">
            <h1 className="text-xl font-medium">{username}</h1>
            <div className="flex flex-col items-end gap-2">
              <Button
                type="button"
                onClick={() => {
                  setError(null);

                  const siteResult = session.executeCommand({
                    contractName: "createSite",
                    payload: {
                      userId: User.prefixId(userId),
                    },
                  });
                  if (siteResult._tag === "Failure") {
                    setError(new ZerospinError(siteResult.failure).message);
                    return;
                  }

                  const siteId = siteResult.success.payload.id;
                  const pageResult = session.executeCommand({
                    contractName: "createPage",
                    payload: {
                      siteId,
                      slug: "home",
                      pageType: "split-scroll",
                    },
                  });
                  if (pageResult._tag === "Failure") {
                    setError(new ZerospinError(pageResult.failure).message);
                    return;
                  }

                  router.push(`/${username}/site/${siteId}/page/${pageResult.success.payload.id}`);
                }}
              >
                Create site
              </Button>
              {error === null ? null : (
                <p role="alert" className="max-w-sm text-right text-sm text-destructive">
                  {error}
                </p>
              )}
            </div>
          </div>
          <p className="text-sm text-muted-foreground">Dashboard</p>
        </div>
      </main>
    </div>
  );
}
