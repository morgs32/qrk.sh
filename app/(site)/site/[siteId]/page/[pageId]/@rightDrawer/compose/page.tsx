"use client";

import { useParams, useRouter } from "next/navigation";
import { Prose } from "../../Prose/Prose";

export default function ComposePage() {
  const router = useRouter();
  const params = useParams<{ siteId: string; pageId: string }>();
  const siteId = params.siteId;
  const pageId = params.pageId;

  return (
    <Prose
      open
      onClose={() => {
        router.push(`/site/${siteId}/page/${pageId}`);
      }}
    />
  );
}
