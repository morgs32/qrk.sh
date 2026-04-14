"use client";

import { useParams, useRouter } from "next/navigation";
import { TileDrawer } from "../../../TileDrawer";

export default function TileDetailPage() {
  const router = useRouter();
  const params = useParams<{ siteId: string; tileId: string }>();
  const siteId = params.siteId;
  const tileId = params.tileId;

  return (
    <TileDrawer
      open
      tileId={tileId}
      onBackToCatalog={() => {
        router.push(`/site/${siteId}/edit-tiles`);
      }}
      onClose={() => {
        router.push(`/site/${siteId}`);
      }}
    />
  );
}
