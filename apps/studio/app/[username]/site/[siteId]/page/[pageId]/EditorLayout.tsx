"use client";

import { useMemo, type ReactNode } from "react";
import { useSelectedLayoutSegments } from "next/navigation";
import { Drawer } from "@qrk.sh/library/Drawer";

import { useUser } from "@clerk/nextjs";
import {
  createLibraryStandaloneSession,
  LibrarySessionContext,
} from "@qrk.sh/library/createLibraryStandaloneSession";
import { libraryModule } from "@qrk.sh/library/libraryModule";
import { WallViewportProvider } from "@qrk.sh/library/WallViewportProvider";
import { prefixId } from "@zerospin/core/models/prefixId";
import { useInitializeStandaloneSession } from "@zerospin/react";
import { Schema } from "effect";

import { Toolbars } from "../../Toolbars/Toolbars";

import { MainColumns } from "./MainColumns";

import { useValidatedParams } from "@/hooks/useValidatedParams";

const ParamsSchema = Schema.Struct({
  username: Schema.String,
  siteId: Schema.String,
  pageId: Schema.String,
});

const WALL_ID = prefixId(libraryModule.models.wall, "library");

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
    <LibraryEditorSession key={documentKey} documentKey={documentKey}>
      <WallViewportProvider>
        <div data-editor-split className="relative h-full min-h-0 overflow-hidden">
          <div data-editor-region className="h-full min-h-0 overflow-hidden">
            <MainColumns />
          </div>
          <Drawer
            side="bottom"
            open={drawerOpen}
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
        <Toolbars />
      </WallViewportProvider>
    </LibraryEditorSession>
  );
}

function LibraryEditorSession(props: { children: React.ReactNode; documentKey: string }) {
  const { children, documentKey } = props;
  const session = useMemo(
    () =>
      createLibraryStandaloneSession({
        key: documentKey,
        wallId: WALL_ID,
      }),
    [documentKey],
  );
  const { isInitialized } = useInitializeStandaloneSession({ session });
  if (!isInitialized) {
    return null;
  }

  return <LibrarySessionContext value={session}>{children}</LibrarySessionContext>;
}
