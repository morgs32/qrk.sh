"use client";

import Link from "next/link";

import { makeId, stageAggregateSessionCommand } from "@zerospin/sdk/browser";

import { useEffect, useState } from "react";
import { Schema } from "effect";
import { toast } from "sonner";
import { useLiveQuery } from "@zerospin/react";
import { ZerospinError } from "@zerospin/sdk/browser";

import { siteV2 as Site } from "@qrk.sh/zerospin/src/aggregates/user/models/site/SiteV2";
import { pageV2 as Page } from "@qrk.sh/zerospin/src/aggregates/user/models/page/PageV2";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { UserApp } from "@/zerospin/userSession";
import { useValidatedParams } from "@/hooks/useValidatedParams";

const ParamsSchema = Schema.Struct({
  username: Schema.String,
});

export default function UsernameDashboardPage() {
  const { username } = useValidatedParams(ParamsSchema);
  const session = UserApp.useInitializedSession();
  const [createSiteOpen, setCreateSiteOpen] = useState(false);
  const [siteName, setSiteName] = useState("");
  const [siteSlug, setSiteSlug] = useState("");
  const { data: user } = useLiveQuery({
    session,
    query: (db) => {
      const state = session.store.getState();
      if (state.initialized === null) {
        throw new Error("Your session is not ready");
      }
      return db.query.user.findFirst({
        where: { clerkUserId: { eq: state.initialized.claims.clerkUserId } },
        with: { sites: { with: { pages: true } } },
      });
    },
  });

  useEffect(
    () =>
      session.failures.subscribe((event) => {
        if (
          (event._tag === "AdmissionFailure" || event._tag === "ExecutionFailure") &&
          (event.commandName === "createSite" || event.commandName === "createPage")
        ) {
          toast.error(event.failure.message);
        }
      }),
    [session],
  );


  if (user === undefined) {
    return <p role="alert">User not found</p>;
  }

  const slugBase = siteName
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const usedSlugs = new Set(user.sites.map((site) => site.slug));
  let suggestedSlug = slugBase;
  let suffix = 1;
  while (suggestedSlug !== "" && usedSlugs.has(suggestedSlug)) {
    suggestedSlug = `${slugBase}-${suffix}`;
    suffix += 1;
  }
  const slug = siteSlug === "" ? suggestedSlug : siteSlug;
  const slugError =
    slug === ""
      ? "Enter a slug or a name that uses letters or numbers."
      : !/^[a-z0-9]+(?:-[a-z0-9]+)*(?![\s\S])/.test(slug)
        ? "Use lowercase letters and numbers separated by single hyphens."
        : usedSlugs.has(slug)
          ? "You already have a site with this slug."
          : null;
  const showSlugError = slugError !== null && (siteName !== "" || siteSlug !== "");

  return (
    <div className="flex flex-col">
      <main className="flex-1 p-6">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-6">
          <div className="flex items-center justify-between gap-3">
            <h1 className="text-xl font-medium">{username}</h1>
            <div className="flex flex-col items-end gap-2">
              <Button
                type="button"
                onClick={() => {
                  setCreateSiteOpen(true);
                }}
              >
                Create site
              </Button>
              <Dialog
                open={createSiteOpen}
                onOpenChange={(open) => {
                  setCreateSiteOpen(open);
                  if (!open) {
                    setSiteName("");
                    setSiteSlug("");
                  }
                }}
              >
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Create site</DialogTitle>
                  </DialogHeader>
                  <form
                    className="flex flex-col gap-4"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const name = siteName.trim();
                      if (name === "") {
                        toast.error("Name is required");
                        return;
                      }
                      if (slugError !== null) {
                        toast.error(slugError);
                        return;
                      }
                      const state = session.store.getState();
                      if (state.initialized === null) {
                        toast.error("Your session is not ready");
                        return;
                      }
                      const siteResult = stageAggregateSessionCommand({
                        session,
                        contractName: "createSite",
                        payload: {
                          id: session.runSync(makeId(Site)),
                          userId: user.id,
                          name,
                          slug,
                        },
                      });
                      if (siteResult._tag === "Failure") {
                        toast.error(new ZerospinError(siteResult.failure).message);
                        return;
                      }

                      const siteId = siteResult.success.payload.id;
                      const pageResult = stageAggregateSessionCommand({
                        session,
                        contractName: "createPage",
                        payload: {
                          id: session.runSync(makeId(Page)),
                          siteId,
                          slug: null,
                        },
                      });
                      if (pageResult._tag === "Failure") {
                        toast.error(new ZerospinError(pageResult.failure).message);
                        return;
                      }

                      setSiteName("");
                      setSiteSlug("");
                      setCreateSiteOpen(false);
                    }}
                  >
                    <div className="flex flex-col gap-2">
                      <label htmlFor="create-site-name" className="text-sm font-medium">
                        Name
                      </label>
                      <Input
                        id="create-site-name"
                        name="name"
                        value={siteName}
                        onChange={(event) => {
                          setSiteName(event.target.value);
                        }}
                        autoFocus
                      />
                    </div>
                    <div className="flex flex-col gap-2">
                      <label htmlFor="create-site-slug" className="text-sm font-medium">
                        Slug
                      </label>
                      <Input
                        id="create-site-slug"
                        name="slug"
                        value={siteSlug}
                        placeholder={suggestedSlug}
                        onChange={(event) => {
                          setSiteSlug(event.target.value);
                        }}
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                        pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                        aria-invalid={showSlugError}
                        aria-describedby="create-site-slug-feedback"
                      />
                      <p
                        id="create-site-slug-feedback"
                        className={`text-sm ${showSlugError ? "text-destructive" : "text-muted-foreground"}`}
                        role="status"
                      >
                        {slugError === null
                          ? siteSlug === ""
                            ? `Available. We'll use ${suggestedSlug} unless you enter your own.`
                            : "Available."
                          : siteName === "" && siteSlug === ""
                            ? "Use lowercase letters and numbers separated by single hyphens."
                            : slugError}
                      </p>
                    </div>
                    <DialogFooter>
                      <DialogClose asChild>
                        <Button type="button" variant="outline">
                          Cancel
                        </Button>
                      </DialogClose>
                      <Button type="submit" disabled={siteName.trim() === "" || slugError !== null}>
                        Create site
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
          </div>
          {user.sites.length > 0 ? (
            <ul className="flex flex-col gap-3">
              {user.sites.map((site) => {
                const page = site.pages.find((page) => page.slug === null) ?? site.pages[0];
                return (
                  <li key={site.id} className="rounded-lg border p-4">
                    {page === undefined ? (
                      <span>{site.name ?? site.slug ?? "Untitled site"}</span>
                    ) : (
                      <Link
                        className="font-medium underline-offset-4 hover:underline"
                        href={`/${encodeURIComponent(username)}/site/${encodeURIComponent(site.id)}/page/${encodeURIComponent(page.id)}`}
                      >
                        {site.name ?? site.slug ?? "Untitled site"}
                      </Link>
                    )}
                    {site.description ? (
                      <p className="mt-2 text-sm text-muted-foreground">{site.description}</p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : (
            <section className="flex flex-col gap-6 py-16">
              <div className="space-y-3 text-sm text-muted-foreground">
                <p>Want some ideas?</p>
                <ul className="list-disc space-y-2 pl-5">
                  <li>A site for your philosophical questions</li>
                  <li>A travel log from your last trip</li>
                </ul>
              </div>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}
