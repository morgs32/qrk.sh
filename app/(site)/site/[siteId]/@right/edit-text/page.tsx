"use client";

import { useParams, useRouter } from "next/navigation";
import { ProseDrawer } from "../../ProseDrawer";

export default function EditTextPage() {
  const router = useRouter();
  const params = useParams<{ siteId: string }>();
  const siteId = params.siteId;

  return (
    <ProseDrawer
      open
      onClose={() => {
        router.push(`/site/${siteId}`);
      }}
    />
  );
}
