"use client";

import { makeIdSchema } from "@zerospin/sdk/browser";
import { useNavigate, useParams } from "@tanstack/react-router";
import { pageV1 } from "@qrk.sh/zerospin/src/aggregates/user/models/page/PageV1";
import { siteV1 } from "@qrk.sh/zerospin/src/aggregates/user/models/site/SiteV1";
import { useLiveQuery } from "@zerospin/react";
import { Schema } from "effect";

import { BREAKPOINTS } from "../../../../../../modules/lib/breakpoints";
import { BrowserChrome } from "../../../../../../modules/lib/BrowserChrome";
import { WallEditor } from "../../../../../../modules/lib/wall/WallEditor";
import { useValidatedParams } from "@/hooks/useValidatedParams";
import { UserUI } from "@/zerospin/UserUI";
import { SiteHeader } from "../../SiteHeader";

export function PagePreview(props: { breakpoint: (typeof BREAKPOINTS)[number] }) {
  const { breakpoint } = props;
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
      }),
  });

  return (
    <BrowserChrome breakpoint={breakpoint.id} previewWidth={breakpoint.previewWidth}>
      <div
        className="wall-preview-scroll isolate min-h-0 flex-1 overflow-y-auto bg-white"
        role="region"
        aria-label={`${breakpoint.id} page preview`}
      >
        <div className="@container grid min-h-full grid-rows-[auto_1fr]">
          <SiteHeader siteId={siteId} />
          <WallEditor
            key={wall.id}
            wallId={wall.id}
            selectedBrickId={selectedBrickId}
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
      </div>
    </BrowserChrome>
  );
}
