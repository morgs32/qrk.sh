"use client";

import { Schema } from "effect";
import { toast } from "sonner";
import { href, useNavigate } from "react-router";
import { useLiveQuery, useSession } from "@zerospin/react";
import { ZerospinError } from "@zerospin/sdk/browser";

import { siteV1 as Site } from "@qrk.sh/zerospin/src/aggregates/user/models/site/SiteV1";
import { pageV1 as Page } from "@qrk.sh/zerospin/src/aggregates/user/models/page/PageV1";

import { Button } from "@/components/ui/button";
import { ZerospinUser } from "@/components/ZerospinUser";
import { useValidatedParams } from "@/hooks/useValidatedParams";

import { Header } from "./Header";

const ParamsSchema = Schema.Struct({
  username: Schema.String,
});

export default function UsernameDashboardPage() {
  const { username } = useValidatedParams(ParamsSchema);
  const navigate = useNavigate();
  const session = useSession(ZerospinUser);
  const { data: user, error } = useLiveQuery(ZerospinUser, {
    query: (db) => {
      const state = session.store.getState();
      if (!state.isInitialized) {
        throw new Error("Your session is not ready");
      }
      return db.query.user.findFirst({
        where: { clerkUserId: { eq: state.authentication.clerkUserId } },
      });
    },
  });

  if (error !== undefined) {
    throw error;
  }

  if (user === undefined) {
    return <p role="alert">User not found</p>;
  }

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
                  const state = session.store.getState();
                  if (!state.isInitialized) {
                    toast.error("Your session is not ready");
                    return;
                  }
                  const siteResult = session.executeCommand({
                    contractName: "createSite",
                    payload: {
                      id: session.makeId(Site),
                      userId: user.id,
                    },
                  });
                  if (siteResult._tag === "Failure") {
                    toast.error(new ZerospinError(siteResult.failure).message);
                    return;
                  }

                  const siteId = siteResult.success.payload.id;
                  const pageResult = session.executeCommand({
                    contractName: "createPage",
                    payload: {
                      id: session.makeId(Page),
                      siteId,
                      slug: "home",
                      pageType: "split-scroll",
                    },
                  });
                  if (pageResult._tag === "Failure") {
                    toast.error(new ZerospinError(pageResult.failure).message);
                    return;
                  }

                  navigate(
                    href("/:username/site/:siteId/page/:pageId", {
                      username,
                      siteId,
                      pageId: pageResult.success.payload.id,
                    }),
                  );
                }}
              >
                Create site
              </Button>
            </div>
          </div>
          <section className="flex flex-col gap-6 py-16">
            <h2 className="max-w-xl text-xl leading-tight">
              Make a site. Throw it out. Start over.
            </h2>
            <div className="space-y-3 text-sm text-muted-foreground">
              <p>Want some ideas?</p>
              <ul className="list-disc space-y-2 pl-5">
                <li>A site for your philosophical questions</li>
                <li>A travel log from your last trip</li>
              </ul>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
