"use client";

import { useParams, useRouter } from "next/navigation";
import { BrickCatalog } from "../../../BrickCatalog";

export default function BrickDetailPage() {
  const router = useRouter();
  const params = useParams<{ siteId: string; brickId: string }>();
  const siteId = params.siteId;
  const brickId = params.brickId;

  return (
    <BrickCatalog
      open
      brickId={brickId}
      onBackToCatalog={() => {
        router.push(`/site/${siteId}/edit-bricks`);
      }}
      onClose={() => {
        router.push(`/site/${siteId}`);
      }}
    />
  );
}
