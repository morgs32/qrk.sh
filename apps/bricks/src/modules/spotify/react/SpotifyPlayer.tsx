"use client";

import { useStateValue } from "@json-render/react";
import { useEffect, useRef, useState } from "react";

export function SpotifyPlayer() {
  const url = useStateValue<string | null>("/brickState/url");
  const containerRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (container === null) return;
    const update = () => setVisible(container.getClientRects().length > 0);
    const observer = new ResizeObserver(update);
    observer.observe(container);
    update();
    return () => observer.disconnect();
  }, [url]);

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
    <div ref={containerRef} className="flex h-full min-h-[180px] w-full flex-1">
      {visible && (
        <iframe
          title="Spotify player"
          src={source.href}
          loading="lazy"
          allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
          allowFullScreen
          className="h-full min-h-[180px] w-full flex-1 border-0"
        />
      )}
    </div>
  );
}
