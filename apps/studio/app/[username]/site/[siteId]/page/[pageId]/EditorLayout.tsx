"use client";

import { useUser } from "@clerk/react";
import { BrickStoreProvider } from "@qrk.sh/library/GridStore";
import { WallViewportProvider } from "@qrk.sh/library/WallViewportProvider";
import { Schema } from "effect";

import { Drawers } from "../../Drawers/Drawers";
import { Toolbars } from "../../Toolbars/Toolbars";
import { useValidatedParams } from "@/hooks/useValidatedParams";

import { MainColumns } from "./MainColumns";

const ParamsSchema = Schema.Struct({
  siteId: Schema.String,
  pageId: Schema.String,
});

export default function SitePage() {
  const params = useValidatedParams(ParamsSchema);
  const { user } = useUser();

  if (user === null || user === undefined) {
    return null;
  }

  return (
    <WallViewportProvider>
      <BrickStoreProvider key={`${user.id}:${params.siteId}:${params.pageId}`}>
        <MainColumns />
        <Drawers />
        <Toolbars />
      </BrickStoreProvider>
    </WallViewportProvider>
  );
}
