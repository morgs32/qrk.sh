"use client";

import { useParams, useRouter } from "next/navigation";
import { BrickDrawer } from "../../../BrickDrawer";

export default function BrickDetailPage() {
  const router = useRouter();
  const params = useParams<{ siteId: string; brickId: string }>();
  const siteId = params.siteId;
  const brickId = params.brickId;

  return (
    <BrickDrawer
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
