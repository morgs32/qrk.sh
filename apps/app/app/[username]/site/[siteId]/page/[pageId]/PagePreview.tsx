"use client";

import { makeIdSchema } from "@zerospin/sdk/browser";
import { useNavigate, useParams } from "@tanstack/react-router";
import { pageV1 } from "@qrk.sh/zerospin/src/aggregates/user/models/page/PageV1";
import { siteV1 } from "@qrk.sh/zerospin/src/aggregates/user/models/site/SiteV1";
import { useLiveQuery, useSession } from "@zerospin/react";
import { Schema } from "effect";
import { useContext } from "react";

import { BREAKPOINTS, PREVIEW_BORDER_WIDTH } from "../../../../../../lib/breakpoints";
import { BrowserChrome } from "../../../../../../components/PagePreview/BrowserChrome";
import { WallEditor } from "../../../../../../components/WallEditor/WallEditor";
import { useValidatedParams } from "@/hooks/useValidatedParams";
import { userSessionDefinition } from "@/zerospin/userSessionDefinition";
import { SiteHeader } from "../../SiteHeader";
import { BrickAutosaveContext } from "./BrickAutosaveContext";

export function PagePreview(props: {
  breakpoint: (typeof BREAKPOINTS)[number];
  scale: number;
  openBrickOnInlineFocus: boolean;
}) {
  const { breakpoint, scale, openBrickOnInlineFocus } = props;
  const autosave = useContext(BrickAutosaveContext);
  if (autosave === null) throw new Error("Brick autosave requires the Page layout");
  const { registerBrickFlush, flushBrick } = autosave;
  const navigate = useNavigate();
  const { brickId: selectedBrickId } = useParams({ strict: false });
  const session = useSession(userSessionDefinition);
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
      }),
  });

  const previewStyle = {
    "--wall-preview-width": `${breakpoint.previewWidth}px`,
    "--wall-preview-border-width": `${PREVIEW_BORDER_WIDTH}px`,
    width: breakpoint.previewWidth + 2 * PREVIEW_BORDER_WIDTH,
    minHeight: `calc(var(--wall-frame-height) / ${scale})`,
    zoom: scale,
  };

  return (
    <div
      className="wall-preview-frame relative isolate mx-auto flex flex-col"
      style={previewStyle}
      data-breakpoint={breakpoint.id}
      role="region"
      aria-label={`${breakpoint.id} page preview`}
    >
      <BrowserChrome breakpoint={breakpoint.id} />
      <SiteHeader siteId={siteId} />
      <WallEditor
        key={wall.id}
        wallId={wall.id}
        inlineEditingAvailable={scale === 1}
        openBrickOnInlineFocus={openBrickOnInlineFocus}
        selectedBrickId={selectedBrickId}
        registerBrickFlush={registerBrickFlush}
        flushBrick={flushBrick}
        onEditBrick={(brickId) => {
          if (
            selectedBrickId === brickId ||
            document.activeElement?.hasAttribute("data-drawer-restoring-focus")
          )
            return;
          void navigate({
            to: "/$username/site/$siteId/page/$pageId/brick/$brickId",
            params: { ...params, brickId },
            search: (previous) => ({
              ...previous,
              breakpoint: breakpoint.id,
            }),
            resetScroll: false,
          });
        }}
      />
    </div>
  );
}
