"use client";

import { useParams, useRouter } from "next/navigation";
import { Prose } from "../../Prose/Prose";

export default function EditTextPage() {
  const router = useRouter();
  const params = useParams<{ siteId: string }>();
  const siteId = params.siteId;

  return (
    <Prose
      open
      onClose={() => {
        router.push(`/site/${siteId}`);
      }}
    />
  );
}
