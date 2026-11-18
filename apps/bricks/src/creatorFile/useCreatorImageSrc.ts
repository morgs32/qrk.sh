import { useEffect, useState } from "react";
import { useSWRConfig } from "swr";
import { isCreatorFileId, makeCreatorFileUrl } from "./creatorFileId";
import type {} from "./creatorFileSWR";

// Resolve a stored image source for display. Managed creator file IDs need the
// authenticated editor transport; pasted URLs and local object URLs pass through,
// and published renders build the anonymous managed URL from the configured API base.
export function useCreatorImageSrc(source: string): string {
  const { fetchCreatorImage } = useSWRConfig();
  const managed = isCreatorFileId(source);
  const [preview, setPreview] = useState<{ source: string; url: string }>();

  useEffect(() => {
    setPreview(undefined);
    if (!managed || fetchCreatorImage === undefined) return;
    const controller = new AbortController();
    let created: string | undefined;
    fetchCreatorImage(source, { signal: controller.signal }).then((blob) => {
      if (controller.signal.aborted) return;
      created = URL.createObjectURL(blob);
      setPreview({ source, url: created });
    }, () => {});
    return () => {
      controller.abort();
      if (created !== undefined) URL.revokeObjectURL(created);
    };
  }, [source, managed, fetchCreatorImage]);

  if (!managed) return source;
  if (fetchCreatorImage !== undefined) return preview?.source === source ? preview.url : "";
  return makeCreatorFileUrl(source);
}
