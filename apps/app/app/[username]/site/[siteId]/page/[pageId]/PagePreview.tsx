"use client";

import { Dialog } from "@base-ui/react/dialog";
import { makeIdSchema, stageAggregateSessionCommand } from "@zerospin/sdk/browser";
import { useNavigate, useParams } from "@tanstack/react-router";
import { isNonEmptySpec } from "@json-render/core";
import { useId, useRef, useState } from "react";
import { pageV1 } from "@qrk.sh/zerospin/src/aggregates/user/models/page/PageV1";
import { siteV1 } from "@qrk.sh/zerospin/src/aggregates/user/models/site/SiteV1";
import { brickV1 } from "@qrk.sh/zerospin/src/aggregates/user/models/brick/BrickV1";
import { useLiveQuery } from "@zerospin/react";
import { Schema } from "effect";

import { Button } from "../../../../../../modules/components/ui/button";
import { StackAction } from "../../../../../../modules/components/StackAction";
import { BrickWrapper } from "../../../../../../modules/components/brick/BrickWrapper";
import { BREAKPOINTS } from "../../../../../../modules/lib/breakpoints";
import { BrowserChrome } from "../../../../../../modules/lib/BrowserChrome";
import { WallPlacement } from "../../../../../../modules/lib/wall/WallPlacement";
import { modulesHash } from "../../../../../../modules/lib/modulesHash";
import { makeWallLayoutView } from "../../../../../../modules/lib/wall/makeWallLayoutView";
import { useValidatedParams } from "@/hooks/useValidatedParams";
import { UserUI } from "@/zerospin/UserUI";
import { SiteHeader } from "../../SiteHeader";

export function PagePreview(props: { breakpoint: (typeof BREAKPOINTS)[number] }) {
  const { breakpoint } = props;
  const wallRef = useRef<HTMLDivElement>(null);
  const returnFocusId = useRef<string | null>(null);
  const scope = useId();
  const [deletingBrickId, setDeletingBrickId] = useState<string | null>(null);
  const navigate = useNavigate();
  const { brickId: selectedBrickId } = useParams({ strict: false });
  const session = UserUI.useSession();
  const params = useValidatedParams(
    Schema.Struct({
      username: Schema.String,
      siteId: makeIdSchema(siteV1),
      pageId: makeIdSchema(pageV1),
    }),
  );
  const { siteId, pageId } = params;
  const { data: wall } = useLiveQuery({
    session,
    key: { siteId, pageId, breakpoint: breakpoint.id },
    query: (db, { siteId, pageId, breakpoint }) =>
      db.query.wall.findFirstOrThrow({
        where: {
          pageId: { eq: pageId },
          breakpoint: { eq: breakpoint },
          page: { siteId: { eq: siteId } },
        },
        with: {
          page: { with: { site: true } },
          placements: { with: { brick: true } },
        },
      }),
  });

  const { sections } = makeWallLayoutView({ wall });

  function editBrick(brickId: string) {
    void navigate({
      to: "/$username/site/$siteId/page/$pageId/brick/$brickId",
      params: { ...params, brickId },
      search: (previous) => ({ ...previous, breakpoint: breakpoint.id, insertion: undefined }),
      resetScroll: false,
    });
  }

  return (
    <>
      <BrowserChrome breakpoint={breakpoint.id} previewWidth={breakpoint.previewWidth}>
        <div
          className="wall-preview-scroll min-h-0 flex-1 overflow-y-auto bg-white"
          role="region"
          aria-label={`${breakpoint.id} page preview`}
        >
          <div className="@container grid min-h-full grid-rows-[auto_1fr]">
            <SiteHeader />
            <div
              ref={wallRef}
              tabIndex={-1}
              className="@container relative flex min-h-80 min-w-0 flex-col bg-background outline-none"
              aria-label={`${breakpoint.id} Wall editor`}
            >
              {sections.map((section) => (
                <section key={section.id} className="relative grid auto-cols-fr grid-flow-col">
                  {section.stacks.map((stack) => (
                    <div key={stack.id} className="group/stack relative min-h-12 min-w-0">
                      {stack.rows.some((row) => row.placements.length > 0) ? (
                        <StackAction>
                          <span className="min-w-0 truncate">{stack.name}</span>
                        </StackAction>
                      ) : null}
                      {stack.rows.map((row) => (
                        <div
                          key={row.id}
                          className="relative flex min-h-12 min-w-0 items-start overflow-x-auto"
                        >
                          {row.placements.map((placement) => {
                            const brick = placement.brick;
                            const module = modulesHash[brick.moduleId];
                            const Component = module.component;
                            return (
                              <WallPlacement
                                key={placement.id}
                                scope={scope}
                                selected={brick.id === selectedBrickId}
                                onEditBrick={editBrick}
                                onRequestDelete={(brickId, triggerId) => {
                                  returnFocusId.current = triggerId;
                                  setDeletingBrickId(brickId);
                                }}
                                placement={{
                                  id: placement.id,
                                  brickId: brick.id,
                                  minWidth: module.variants[placement.variantId].minWidth,
                                  content:
                                    brick.state === null || isNonEmptySpec(placement.spec) ? (
                                      <div
                                        className={`brick-surface ${wall.page.site.cardStyle ? "brick-surface-card" : "brick-surface-flat"} brick-hover-target relative min-w-0`}
                                      >
                                        <BrickWrapper className="brick-hover-surface h-auto">
                                          <Component
                                            state={brick.state}
                                            variantId={placement.variantId}
                                            spec={
                                              isNonEmptySpec(placement.spec)
                                                ? placement.spec
                                                : module.variants[placement.variantId].spec
                                            }
                                          />
                                        </BrickWrapper>
                                      </div>
                                    ) : (
                                      <p role="alert">Invalid Brick spec</p>
                                    ),
                                }}
                              />
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  ))}
                </section>
              ))}
            </div>
          </div>
        </div>
      </BrowserChrome>
      <Dialog.Root
        open={deletingBrickId !== null}
        onOpenChange={(open) => {
          if (!open) setDeletingBrickId(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-[100] bg-black/30" />
          <Dialog.Popup
            finalFocus={() =>
              wallRef.current?.ownerDocument.getElementById(returnFocusId.current ?? "") ??
              wallRef.current?.querySelector<HTMLElement>("button") ??
              wallRef.current
            }
            className="fixed left-1/2 top-1/2 z-[101] grid w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 gap-4 border bg-background p-6 text-foreground shadow-xl outline-none"
          >
            <Dialog.Title className="text-lg font-medium">Delete Brick?</Dialog.Title>
            <Dialog.Description className="text-sm text-muted-foreground">
              This deletes the shared Brick and its Placements at all four breakpoints, then removes
              empty Rows, Stacks, and Sections.
            </Dialog.Description>
            <div className="flex justify-end gap-2">
              <Dialog.Close render={<Button variant="outline" />}>Cancel</Dialog.Close>
              <Button
                variant="destructive"
                onClick={() => {
                  if (deletingBrickId === null) return;
                  const brickId = Schema.decodeUnknownSync(makeIdSchema(brickV1))(deletingBrickId);
                  const result = stageAggregateSessionCommand({
                    session,
                    contractName: "deleteBrick",
                    payload: { brickId },
                  });
                  if (result._tag !== "Success") return;
                  setDeletingBrickId(null);
                  if (selectedBrickId === brickId) {
                    void navigate({
                      to: "/$username/site/$siteId/page/$pageId",
                      params,
                      search: (previous) => ({
                        ...previous,
                        breakpoint: breakpoint.id,
                        insertion: undefined,
                      }),
                      resetScroll: false,
                    });
                  }
                }}
              >
                Delete Brick
              </Button>
            </div>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
