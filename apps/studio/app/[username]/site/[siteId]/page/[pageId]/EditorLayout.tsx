"use client";

import { useUser } from "@clerk/react";
import { BrickBreakpointProvider } from "@qrk.sh/library/BrickBreakpointProvider";
import { BrickStoreProvider } from "@qrk.sh/library/GridStore";
import { Schema } from "effect";

import { Drawers } from "../../Drawers/Drawers";
import { Toolbars } from "../../Toolbars/Toolbars";
import { useBreakpointsPreviewStore } from "../../Toolbars/useBreakpointsPreviewStore";
import { useValidatedParams } from "@/hooks/useValidatedParams";

import { MainColumns } from "./MainColumns";

const ParamsSchema = Schema.Struct({
  siteId: Schema.String,
  pageId: Schema.String,
});

export default function SitePage() {
  const persistedWidth = useBreakpointsPreviewStore((state) => state.selectedWidth);
  const params = useValidatedParams(ParamsSchema);
  const { user } = useUser();

  if (user === null || user === undefined) {
    return null;
  }

  return (
    <BrickBreakpointProvider persistedWidth={persistedWidth}>
      <BrickStoreProvider key={`${user.id}:${params.siteId}:${params.pageId}`}>
        <MainColumns />
        <Drawers />
        <Toolbars />
      </BrickStoreProvider>
    </BrickBreakpointProvider>
  );
}
