"use client";

import { useParams, useRouter } from "next/navigation";
import { BrickDrawer } from "../../BrickDrawer";

export default function EditBricksPage() {
  const router = useRouter();
  const params = useParams<{ siteId: string }>();
  const siteId = params.siteId;

  return (
    <BrickDrawer
      open
      brickId={null}
      onBackToCatalog={() => {
        router.push(`/site/${siteId}/edit-bricks`);
      }}
      onClose={() => {
        router.push(`/site/${siteId}`);
      }}
    />
  );
}
