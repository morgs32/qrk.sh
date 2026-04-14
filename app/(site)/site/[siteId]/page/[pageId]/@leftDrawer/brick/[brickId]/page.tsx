"use client";

import { useParams, useRouter } from "next/navigation";
import { BrickCatalog } from "../../../BrickCatalog/BrickCatalog";

export default function BrickDetailPage() {
  const router = useRouter();
  const params = useParams<{ siteId: string; pageId: string; brickId: string }>();
  const siteId = params.siteId;
  const pageId = params.pageId;
  const brickId = params.brickId;

  return (
    <BrickCatalog
      open
      brickId={brickId}
      onBackToCatalog={() => {
        router.push(`/site/${siteId}/page/${pageId}/brick-catalog`);
      }}
      onClose={() => {
        router.push(`/site/${siteId}/page/${pageId}`);
      }}
    />
  );
}
