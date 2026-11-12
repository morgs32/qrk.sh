"use client";

import { useStateValue } from "@json-render/react";
import { youtubeContentSchema, youtubeEmbedUrl } from "../definition/youtubeSchemas";

export function YoutubePlayer() {
  const content = useStateValue<typeof youtubeContentSchema.Type | null>("/content");
  if (content == null) return <div className="grid min-h-[200px] w-full flex-1 place-items-center bg-muted p-3 text-center text-sm text-muted-foreground">Add a YouTube link</div>;
  // TODO: Check Made for Kids status before embedding each video, including changing playlists.
  return <iframe title="YouTube player" src={youtubeEmbedUrl(content)} allow="encrypted-media; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" className="h-full min-h-[200px] w-full flex-1 border-0" />;
}
