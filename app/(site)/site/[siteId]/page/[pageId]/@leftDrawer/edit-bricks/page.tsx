"use client";

import { useParams, useRouter } from "next/navigation";
import { BrickCatalog } from "../../BrickCatalog/BrickCatalog";

export default function EditBricksPage() {
  const router = useRouter();
  const params = useParams<{ siteId: string; pageId: string }>();
  const siteId = params.siteId;
  const pageId = params.pageId;

  return (
    <BrickCatalog
      open
      brickId={null}
      onBackToCatalog={() => {
        router.push(`/site/${siteId}/page/${pageId}/edit-bricks`);
      }}
      onClose={() => {
        router.push(`/site/${siteId}/page/${pageId}`);
      }}
    />
  );
}
