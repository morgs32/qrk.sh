"use client";

import { useStateValue } from "@json-render/react";

export function SpotifyPlayer() {
  const url = useStateValue<string | null>("/url");
  if (url == null) {
    return (
      <div className="grid min-h-[180px] w-full flex-1 place-items-center bg-muted p-3 text-center text-sm text-muted-foreground">
        Add a Spotify link
      </div>
    );
  }

  const source = new URL(url);
  source.pathname = `/embed${source.pathname}`;
  return (
    <iframe
      title="Spotify player"
      src={source.href}
      loading="lazy"
      allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
      allowFullScreen
      className="h-full min-h-[180px] w-full flex-1 border-0"
    />
  );
}
