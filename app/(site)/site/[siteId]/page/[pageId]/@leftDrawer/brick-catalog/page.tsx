"use client";

import { useParams, useRouter } from "next/navigation";
import { BrickCatalog } from "../../BrickCatalog";

export default function BrickCatalogPage() {
  const router = useRouter();
  const params = useParams<{ siteId: string; pageId: string }>();
  const siteId = params.siteId;
  const pageId = params.pageId;

  return (
    <BrickCatalog
      open
      brickId={null}
      onBackToCatalog={() => {
        router.push(`/site/${siteId}/page/${pageId}/brick-catalog`);
      }}
      onClose={() => {
        router.push(`/site/${siteId}/page/${pageId}`);
      }}
    />
  );
}
