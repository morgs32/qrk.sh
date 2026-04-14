"use client";

import { useParams, useRouter } from "next/navigation";
import { Compose } from "../../Compose/Compose";

export default function ComposePage() {
  const router = useRouter();
  const params = useParams<{ siteId: string; pageId: string }>();
  const siteId = params.siteId;
  const pageId = params.pageId;

  return (
    <Compose
      onClose={() => {
        router.push(`/site/${siteId}/page/${pageId}`);
      }}
    />
  );
}
