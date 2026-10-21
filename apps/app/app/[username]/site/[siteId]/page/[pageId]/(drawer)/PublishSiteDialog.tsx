"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useLiveQuery } from "@zerospin/react";
import { makeId, stageAggregateSessionCommand } from "@zerospin/sdk/browser";
import { pageSnapshotV1 as PageSnapshot } from "@qrk.sh/zerospin/src/aggregates/user/models/pageSnapshot/PageSnapshotV1";

import { SiteTree, type ISiteTreeNode } from "@/components/SiteTree";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { UserUI } from "@/zerospin/UserUI";

export function PublishSiteDialog(props: { siteId: `sit_${string}` }) {
  const { siteId } = props;
  const session = UserUI.useSession();
  const [open, setOpen] = useState(false);
  const [selectedPageIds, setSelectedPageIds] = useState<Array<`pag_${string}`>>([]);
  const { data: pages } = useLiveQuery({
    session,
    key: siteId,
    query: (db, id) => db.query.page.findMany({ where: { siteId: { eq: id } } }),
  });

  const rootPages = pages.filter((page) => page.slug === null);
  const rootPage = rootPages.length === 1 ? rootPages[0] : undefined;
  const otherPages = pages
    .filter((page) => page.id !== rootPage?.id)
    .sort(
      (left, right) =>
        (left.slug ?? "").localeCompare(right.slug ?? "") || left.id.localeCompare(right.id),
    );

  const treeNodes: ISiteTreeNode[] = [];
  const branches = new Map<string, { node: ISiteTreeNode; children: ISiteTreeNode[] }>();
  for (const page of otherPages) {
    const segments = (page.slug ?? "").split("/");
    let siblings = treeNodes;
    for (const [index, segment] of segments.entries()) {
      const path = JSON.stringify(segments.slice(0, index + 1));
      let branch = branches.get(path);
      if (branch === undefined) {
        const children: ISiteTreeNode[] = [];
        const node: ISiteTreeNode = { label: segment, children };
        branch = { node, children };
        branches.set(path, branch);
        siblings.push(node);
      }
      if (index < segments.length - 1) {
        siblings = branch.children;
        continue;
      }
      const checkbox: ISiteTreeNode["checkbox"] = {
        checked: selectedPageIds.includes(page.id),
        onCheckedChange: (checked) => {
          setSelectedPageIds((current) =>
            checked
              ? current.includes(page.id)
                ? current
                : [...current, page.id]
              : current.filter((id) => id !== page.id),
          );
        },
      };
      if (branch.node.checkbox === undefined) {
        branch.node.checkbox = checkbox;
      } else {
        siblings.push({ label: segment, checkbox });
      }
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) {
          setSelectedPageIds(
            pages
              .filter((page) => page.isPublished || page.id === rootPage?.id)
              .map((page) => page.id),
          );
        }
        setOpen(nextOpen);
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" size="sm">
          Publish Site
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Publish Site</DialogTitle>
          <DialogDescription>
            Choose saved pages to publish. The root page (/) is required.
          </DialogDescription>
        </DialogHeader>
        <form
          autoComplete="off"
          className="flex min-h-0 flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (rootPage === undefined) {
              toast.error("The site must have exactly one root page before publishing");
              return;
            }
            const result = stageAggregateSessionCommand({
              session,
              contractName: "publishSite",
              payload: {
                siteId,
                pages: pages
                  .filter((page) => page.id === rootPage.id || selectedPageIds.includes(page.id))
                  .map((page) => ({
                    pageId: page.id,
                    snapshotId: session.runSync(makeId(PageSnapshot)),
                  })),
              },
            });
            if (result._tag === "Failure") return;
            setOpen(false);
          }}
        >
          {rootPage === undefined ? (
            <p role="alert" className="text-sm text-destructive">
              The site must have exactly one root page before publishing.
            </p>
          ) : (
            <div className="max-h-[50vh] overflow-y-auto">
              <SiteTree
                nodes={[
                  {
                    label: "/",
                    checkbox: { checked: true, disabled: true },
                    children: treeNodes,
                  },
                ]}
              />
            </div>
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={rootPage === undefined}>
              Publish Site
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
