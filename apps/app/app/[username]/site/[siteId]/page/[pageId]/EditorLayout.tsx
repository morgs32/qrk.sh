"use client";

import { makeIdSchema } from "@zerospin/sdk/browser";

import { useState, type ReactNode } from "react";
import { useLocation, useMatches } from "@tanstack/react-router";
import { Drawer } from "../../../../../../modules/lib/Drawer";

import { useAuth, useUser } from "@clerk/react";
import { ClerkOfflineError } from "@clerk/react/errors";
import { SWRConfig } from "swr";
import { WallViewportProvider } from "../../../../../../modules/lib/WallViewportProvider";
import { WallPreviewViewport } from "../../../../../../modules/lib/WallPreviewViewport";
import { BrickCardStyleContext } from "../../../../../../modules/lib/BrickCardStyleContext";
import { useLiveQuery } from "@zerospin/react";
import { siteV1 as Site } from "@qrk.sh/zerospin/src/aggregates/user/models/site/SiteV1";
import { Schema } from "effect";

import { Toolbars } from "../../Toolbars/Toolbars";

import { MainColumns } from "./MainColumns";
import { WallEditorProvider } from "./WallEditorProvider";
import { DrawerHeader } from "./(drawer)/DrawerHeader";

import { useValidatedParams } from "@/hooks/useValidatedParams";
import { UserUI } from "@/zerospin/UserUI";

const ParamsSchema = Schema.Struct({
  username: Schema.String,
  siteId: makeIdSchema(Site),
  pageId: Schema.String,
});

export default function EditorLayout(props: { children: ReactNode }) {
  const { children } = props;
  const params = useValidatedParams(ParamsSchema);
  const drawerOpen = useMatches({
    select: (matches) =>
      matches.some((match) => match.routeId === "/$username/site/$siteId/page/$pageId/_drawer"),
  });
  const pathname = useLocation({ select: (location) => location.pathname });
  const [previewCards, setPreviewCards] = useState<boolean | null>(null);
  const { user } = useUser();
  const { getToken } = useAuth();
  const session = UserUI.useSession();
  const { data: site } = useLiveQuery({
    session,
    key: params.siteId,
    query: (db, siteId) => db.query.site.findFirst({ where: { id: { eq: siteId } } }),
  });

  if (user === null || user === undefined) {
    return null;
  }

  const documentKey = JSON.stringify(["app", user.id, params.siteId, params.pageId]);
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!apiUrl) throw new Error("NEXT_PUBLIC_API_URL is required");
  const uploadImage = async (file: File, options: { signal: AbortSignal }): Promise<string> => {
    const { signal } = options;
    const token = await getToken().catch((cause) => {
      if (ClerkOfflineError.is(cause)) throw new Error("Clerk is offline");
      throw cause;
    });
    signal.throwIfAborted();
    if (token === null) throw new Error("Sign in to upload images");
    const body = new FormData();
    body.set("file", file);
    body.set("siteId", params.siteId);
    const response = await fetch(`${apiUrl.replace(/\/$/, "")}/upload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body,
      signal,
    });
    const result: unknown = await response.json();
    if (!response.ok) {
      const error = Schema.decodeUnknownSync(
        Schema.Struct({ code: Schema.String, message: Schema.String }),
      )(result);
      throw new Error(error.message);
    }
    const uploaded = Schema.decodeUnknownSync(
      Schema.Struct({ key: Schema.String, url: Schema.String, contentType: Schema.String }),
    )(result);
    return uploaded.url;
  };

  return (
    <BrickCardStyleContext value={previewCards ?? site?.cardStyle ?? false}>
      <SWRConfig value={{ uploadImage }}>
        <WallViewportProvider key={documentKey}>
          <WallEditorProvider>
            <div data-editor-split className="relative h-full min-h-0 overflow-hidden">
              <WallPreviewViewport
                toolbar={<Toolbars />}
                drawerOpen={drawerOpen}
                closedDrawerHeight={56}
              >
                <MainColumns />
              </WallPreviewViewport>
              <Drawer
                side="bottom"
                open={drawerOpen}
                persistentHeader={
                  <DrawerHeader
                    key={pathname}
                    open={drawerOpen}
                    cardStyle={previewCards ?? site?.cardStyle ?? false}
                    onCardStyleChange={setPreviewCards}
                  />
                }
                animated={
                  drawerOpen ||
                  (typeof document !== "undefined" &&
                    typeof document.startViewTransition === "function")
                }
                aria-label="Workspace drawer"
              >
                {children}
              </Drawer>
            </div>
          </WallEditorProvider>
        </WallViewportProvider>
      </SWRConfig>
    </BrickCardStyleContext>
  );
}
