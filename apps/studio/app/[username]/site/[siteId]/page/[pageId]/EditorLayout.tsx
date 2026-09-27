"use client";

import { useMemo } from "react";

import { useUser } from "@clerk/react";
import {
  createLibraryStandaloneSession,
  LibrarySessionContext,
} from "@qrk.sh/library/createLibraryStandaloneSession";
import { LibraryFrontend } from "@qrk.sh/library/LibraryFrontend";
import { WallViewportProvider } from "@qrk.sh/library/WallViewportProvider";
import { prefixId } from "@zerospin/core/models/prefixId";
import { useInitializeStandaloneSession } from "@zerospin/react";
import { Schema } from "effect";

import { Drawers } from "../../Drawers/Drawers";
import { Toolbars } from "../../Toolbars/Toolbars";

import { MainColumns } from "./MainColumns";

import { useValidatedParams } from "@/hooks/useValidatedParams";

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

  const documentKey = JSON.stringify(["studio", user.id, params.siteId, params.pageId]);

  return (
    <LibraryEditorSession key={documentKey} documentKey={documentKey}>
      <WallViewportProvider>
        <MainColumns />
        <Drawers />
        <Toolbars />
      </WallViewportProvider>
    </LibraryEditorSession>
  );
}

function LibraryEditorSession(props: { children: React.ReactNode; documentKey: string }) {
  const session = useMemo(
    () =>
      createLibraryStandaloneSession({
        key: props.documentKey,
        wallId: WALL_ID,
      }),
    [props.documentKey],
  );
  const { isInitialized } = useInitializeStandaloneSession({ session });
  if (!isInitialized) {
    return null;
  }

  return <LibrarySessionContext value={session}>{props.children}</LibrarySessionContext>;
}
