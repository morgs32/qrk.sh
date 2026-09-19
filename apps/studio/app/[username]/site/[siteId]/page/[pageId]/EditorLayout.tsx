"use client";

import { useUser } from "@clerk/react";
import {
  createLibraryMockSession,
  LibrarySessionContext,
} from "@qrk.sh/library/createLibraryMockSession";
import { LibraryFrontend } from "@qrk.sh/library/LibraryFrontend";
import { WallViewportProvider } from "@qrk.sh/library/WallViewportProvider";
import { prefixId } from "@zerospin/core/models/prefixId";
import { useInitializeMockSession } from "@zerospin/react";
import { Schema } from "effect";
import { useMemo } from "react";

import { Drawers } from "../../Drawers/Drawers";
import { Toolbars } from "../../Toolbars/Toolbars";
import { useValidatedParams } from "@/hooks/useValidatedParams";

import { MainColumns } from "./MainColumns";

const ParamsSchema = Schema.Struct({
  siteId: Schema.String,
  pageId: Schema.String,
});

const WALL_ID = prefixId(LibraryFrontend.models.wall, "library");

export default function SitePage() {
  const params = useValidatedParams(ParamsSchema);
  const { user } = useUser();

  if (user === null || user === undefined) {
    return null;
  }

  return (
    <LibraryEditorSession key={`${user.id}:${params.siteId}:${params.pageId}`}>
      <WallViewportProvider>
        <MainColumns />
        <Drawers />
        <Toolbars />
      </WallViewportProvider>
    </LibraryEditorSession>
  );
}

function LibraryEditorSession(props: { children: React.ReactNode }) {
  const session = useMemo(() => createLibraryMockSession({ wallId: WALL_ID }), []);
  const { isInitialized } = useInitializeMockSession({ session });
  if (!isInitialized) {
    return null;
  }

  return <LibrarySessionContext value={session}>{props.children}</LibrarySessionContext>;
}
