"use client";

import { type ReactNode } from "react";
import { useSelectedLayoutSegments } from "next/navigation";
import { Drawer } from "@qrk.sh/library/Drawer";

import { useUser } from "@clerk/nextjs";
import { WallViewportProvider } from "@qrk.sh/library/WallViewportProvider";
import { Schema } from "effect";

import { Toolbars } from "../../Toolbars/Toolbars";

import { MainColumns } from "./MainColumns";

import { useValidatedParams } from "@/hooks/useValidatedParams";

const ParamsSchema = Schema.Struct({
  username: Schema.String,
  siteId: Schema.String,
  pageId: Schema.String,
});

export default function EditorLayout(props: { children: ReactNode }) {
  const { children } = props;
  const params = useValidatedParams(ParamsSchema);
  const segments = useSelectedLayoutSegments();
  const drawerOpen = segments.includes("(drawer)");
  const { user } = useUser();

  if (user === null || user === undefined) {
    return null;
  }

  const documentKey = JSON.stringify(["studio", user.id, params.siteId, params.pageId]);

  return (
    <WallViewportProvider key={documentKey}>
      <div data-editor-split className="relative h-full min-h-0 overflow-hidden">
        <div data-editor-region className="h-full min-h-0 overflow-hidden">
          <MainColumns />
        </div>
        <Drawer
          side="bottom"
          open={drawerOpen}
          animated={
            drawerOpen ||
            (typeof document !== "undefined" && typeof document.startViewTransition === "function")
          }
          aria-label="Workspace drawer"
        >
          {children}
        </Drawer>
      </div>
      <Toolbars />
    </WallViewportProvider>
  );
}
