"use client";

import { Link } from "@tanstack/react-router";
import { UnderlinedLink } from "@qrk.sh/web/components/UnderlinedLink";

import { makeId, stageAggregateSessionCommand } from "@zerospin/sdk/browser";

import { useLayoutEffect, useState } from "react";
import { toast } from "sonner";
import { useLiveQuery, useSession } from "@zerospin/react";
import { siteV1 as Site } from "@qrk.sh/bricks/zerospin/models/site/SiteV1";
import { pageV1 as Page } from "@qrk.sh/bricks/zerospin/models/page/PageV1";

import { Button } from "@qrk.sh/bricks/components/button";
import { Dialog } from "@base-ui/react/dialog";
import { DialogContent } from "@qrk.sh/bricks/components/dialog";
import { Field, FieldLabel } from "@qrk.sh/bricks/components/field";
import { Input } from "@qrk.sh/bricks/components/Input";
import { TextboxInput } from "@qrk.sh/bricks/components/TextboxInput";
import { userSessionDefinition } from "@/zerospin/userSessionDefinition";
import { useUsername } from "@/hooks/useUsername";
import { startupTiming } from "@/lib/startupTiming";
import { useWarnBeforeUnload } from "@qrk.sh/bricks/modules/react/useWarnBeforeUnload";

export default function UsernameDashboardPage() {
  const username = useUsername();
  const session = useSession(userSessionDefinition);
  const [createSiteOpen, setCreateSiteOpen] = useState(false);
  const [siteName, setSiteName] = useState("");
  const [siteDescription, setSiteDescription] = useState("");
  useWarnBeforeUnload(createSiteOpen && (siteName !== "" || siteDescription !== ""));
  const { data: user } = useLiveQuery({
    session,
    query: (db) => {
      const state = session.store.getState();
      if (state.initialized === null) {
        throw new Error("Your session is not ready");
      }
      return db.query.user.findFirst({
        where: { clerkUserId: { eq: state.initialized.claims.clerkUserId } },
        with: { sites: { with: { pages: true, failures: true } } },
      });
    },
  });
  const { data: usernameStatus } = useLiveQuery({
    session,
    query: (db) => {
      const state = session.store.getState();
      if (state.initialized === null) throw new Error("Your session is not ready");
      return db.query.usernameStatus.findFirst({
        where: { user: { clerkUserId: { eq: state.initialized.claims.clerkUserId } } },
      });
    },
  });

  useLayoutEffect(() => {
    startupTiming.dashboardCommitted(user !== undefined);
  }, [session, user]);

  if (user === undefined) {
    return <p role="alert">User not found</p>;
  }

  const canCreateSite = user.username !== null && user.username !== "" && !usernameStatus?.pending;

  return (
    <div className="flex flex-col">
      <main className="flex-1 p-6">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-6">
          <div className="flex items-center justify-between gap-3">
            <h1 className="text-xl font-medium">{user.username ?? "Your sites"}</h1>
            <div className="flex flex-col items-end gap-2">
              <Dialog.Root
                open={createSiteOpen}
                onOpenChange={(open) => {
                  setCreateSiteOpen(open);
                  if (!open) {
                    setSiteName("");
                    setSiteDescription("");
                  }
                }}
              >
                <Dialog.Trigger render={<Button type="button" disabled={!canCreateSite} />}>
                  Create site
                </Dialog.Trigger>
                <DialogContent>
                  <div className="grid gap-2 pe-8">
                    <Dialog.Title className="text-sm font-medium">Create site</Dialog.Title>
                  </div>
                  <form
                    autoComplete="off"
                    className="flex flex-col gap-4"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const name = siteName.trim();
                      if (name === "") {
                        toast.error("Name is required");
                        return;
                      }
                      const description = siteDescription.trim();
                      if (description === "") {
                        toast.error("Description is required");
                        return;
                      }
                      if (!canCreateSite) return;
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
                          description,
                          slug: null,
                        },
                      });
                      if (siteResult._tag === "Failure") return;

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
                      if (pageResult._tag === "Failure") return;

                      setSiteName("");
                      setSiteDescription("");
                      setCreateSiteOpen(false);
                    }}
                  >
                    <Field>
                      <FieldLabel htmlFor="create-site-name">Name</FieldLabel>
                      <Input
                        id="create-site-name"
                        name="name"
                        value={siteName}
                        onChange={(event) => {
                          setSiteName(event.target.value);
                        }}
                        autoFocus
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="create-site-description">Description</FieldLabel>
                      <TextboxInput
                        id="create-site-description"
                        name="description"
                        value={siteDescription}
                        onChange={(event) => {
                          setSiteDescription(event.target.value);
                        }}
                        required
                      />
                    </Field>
                    <div className="flex flex-wrap justify-end gap-2">
                      <Dialog.Close
                        render={
                          <Button type="button" variant="outline">
                            Cancel
                          </Button>
                        }
                      />
                      <Button
                        type="submit"
                        disabled={
                          siteName.trim() === "" || siteDescription.trim() === "" || !canCreateSite
                        }
                      >
                        Create site
                      </Button>
                    </div>
                  </form>
                </DialogContent>
              </Dialog.Root>
              {!canCreateSite ? (
                <p className="text-sm text-muted-foreground">
                  Save a username in{" "}
                  <Link to="/$username/settings" params={{ username }} className="underline">
                    Settings
                  </Link>{" "}
                  before creating a Site.
                </p>
              ) : null}
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
                      <UnderlinedLink asChild className="font-medium" size="lg">
                        <Link
                          to="/$username/site/$siteId/page/$pageId"
                          params={{ username, siteId: site.id, pageId: page.id }}
                        >
                          {site.name ?? site.slug ?? "Untitled site"}
                        </Link>
                      </UnderlinedLink>
                    )}
                    {site.description ? (
                      <p className="mt-2 text-sm text-muted-foreground">{site.description}</p>
                    ) : null}
                    {site.hostname !== null ? (
                      <p className="mt-2 text-sm text-muted-foreground">
                        {site.hostname}.{new URL(process.env.NEXT_PUBLIC_WEB_ORIGIN ?? "https://qrk.localhost").host}
                      </p>
                    ) : null}
                    {site.failures.map((failure) => (
                      <p key={failure.id} role="alert" className="mt-2 text-sm text-destructive">
                        {failure.message}
                      </p>
                    ))}
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
