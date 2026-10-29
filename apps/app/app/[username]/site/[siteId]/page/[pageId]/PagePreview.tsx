"use client";

import { makeIdSchema } from "@zerospin/sdk/browser";
import { useNavigate, useParams } from "@tanstack/react-router";
import { pageV1 } from "@qrk.sh/zerospin/src/aggregates/user/models/page/PageV1";
import { siteV1 } from "@qrk.sh/zerospin/src/aggregates/user/models/site/SiteV1";
import { useLiveQuery } from "@zerospin/react";
import { Schema } from "effect";

import { BREAKPOINTS, PREVIEW_BORDER_WIDTH } from "../../../../../../modules/lib/breakpoints";
import { BrowserChrome } from "../../../../../../modules/lib/BrowserChrome";
import { WallEditor } from "../../../../../../modules/lib/wall/WallEditor";
import { useValidatedParams } from "@/hooks/useValidatedParams";
import { UserUI } from "@/zerospin/UserUI";
import { SiteHeader } from "../../SiteHeader";

export function PagePreview(props: { breakpoint: (typeof BREAKPOINTS)[number] }) {
  const { breakpoint } = props;
  const navigate = useNavigate();
  const { brickId: selectedBrickId, stackId: selectedStackId } = useParams({ strict: false });
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
      }),
  });

  const previewStyle = {
    "--wall-preview-width": `${breakpoint.previewWidth}px`,
    "--wall-preview-border-width": `${PREVIEW_BORDER_WIDTH}px`,
    minHeight: "var(--wall-frame-height)",
  };

  return (
    <div
      className="wall-preview-frame relative isolate flex w-full flex-col"
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
        selectedBrickId={selectedBrickId}
        selectedStackId={selectedStackId}
        onEditStack={(stackId) => {
          if (selectedStackId === stackId) return;
          void navigate({
            to: "/$username/site/$siteId/page/$pageId/stack/$stackId",
            params: { ...params, stackId },
            search: (previous) => ({
              ...previous,
              breakpoint: breakpoint.id,
              insertion: undefined,
            }),
            resetScroll: false,
          });
        }}
        onEditBrick={(brickId) => {
          void navigate({
            to: "/$username/site/$siteId/page/$pageId/brick/$brickId",
            params: { ...params, brickId },
            search: (previous) => ({
              ...previous,
              breakpoint: breakpoint.id,
              insertion: undefined,
            }),
            resetScroll: false,
          });
        }}
        onBrickDeleted={(brickId) => {
          if (selectedBrickId !== brickId) return;
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
        }}
      />
    </div>
  );
}
