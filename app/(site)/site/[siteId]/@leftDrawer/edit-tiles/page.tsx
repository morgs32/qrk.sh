"use client";

import { useParams, useRouter } from "next/navigation";
import { TileDrawer } from "../../TileDrawer";

export default function EditTilesPage() {
  const router = useRouter();
  const params = useParams<{ siteId: string }>();
  const siteId = params.siteId;

  return (
    <TileDrawer
      open
      tileId={null}
      onBackToCatalog={() => {
        router.push(`/site/${siteId}/edit-tiles`);
      }}
      onClose={() => {
        router.push(`/site/${siteId}`);
      }}
    />
  );
}
