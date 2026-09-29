"use client";

import { useAuth } from "@clerk/nextjs";
import { useLayoutEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useRouter, useSelectedLayoutSegments } from "next/navigation";

import { BrickWall } from "@qrk.sh/library/BrickWall";
import { useLibrarySession } from "@qrk.sh/library/createLibraryStandaloneSession";
import { libraryModule } from "@qrk.sh/library/libraryModule";
import { useWallViewport } from "@qrk.sh/library/WallViewportProvider";
import { prefixId } from "@zerospin/core/models/prefixId";
import { Schema } from "effect";

import { useValidatedParams } from "@/hooks/useValidatedParams";

const ParamsSchema = Schema.Struct({
  username: Schema.String,
  siteId: Schema.String,
  pageId: Schema.String,
});

const WALL_ID = prefixId(libraryModule.models.wall, "library");

export function Grid() {
  const { wallRef, wallWidth, wallBreakpoint } = useWallViewport();
  const session = useLibrarySession();
  const params = useValidatedParams(ParamsSchema);
  const router = useRouter();
  const segments = useSelectedLayoutSegments();
  const route = segments.find((segment) => !segment.startsWith("("));
  const region = useRef<HTMLDivElement>(null);
  const [pendingTextId, setPendingTextId] = useState<string | null>(null);
  const { getToken } = useAuth();
  const [activeText, setActiveText] = useState<{
    brickId: string;
    breakpoint: "sm" | "md" | "lg" | "xl";
  } | null>(null);
  if (activeText !== null && activeText.breakpoint !== wallBreakpoint) setActiveText(null);

  useLayoutEffect(() => {
    if (pendingTextId === null || route !== undefined || wallBreakpoint === null) return;
    if (Math.abs((region.current?.getBoundingClientRect().width ?? 0) - wallWidth) > 1) return;
    let cancelled = false;
    // Wait for the base route's actual wall width before choosing the editing breakpoint.
    queueMicrotask(() => {
      if (cancelled) return;
      setActiveText({ brickId: pendingTextId, breakpoint: wallBreakpoint });
      setPendingTextId(null);
    });
    return () => {
      cancelled = true;
    };
  }, [pendingTextId, route, wallBreakpoint, wallWidth]);

  return (
    <div ref={wallRef} className="min-h-full w-full" data-testid="grid-region">
      <div
        ref={region}
        className="min-h-full w-full"
        data-testid="grid-layout"
        data-wall-breakpoint={wallBreakpoint ?? "sm"}
      >
        <BrickWall
          session={session}
          wallId={WALL_ID}
          breakpoint={wallBreakpoint ?? "sm"}
          gridWidth={wallWidth}
          activeTextBrickId={activeText?.breakpoint === wallBreakpoint ? activeText.brickId : null}
          isActive={wallWidth > 0}
          onCommandError={(message) => toast.error(message)}
          onTextEditStart={(brickId) => {
            setPendingTextId(brickId);
            router.push(
              `/${encodeURIComponent(params.username)}/site/${encodeURIComponent(params.siteId)}/page/${encodeURIComponent(params.pageId)}`,
              { scroll: false },
            );
          }}
          onTextEditEnd={() => setActiveText(null)}
          uploadImage={async (file, onProgress, signal) => {
            signal?.throwIfAborted();
            const sessionToken = await getToken();
            signal?.throwIfAborted();
            if (!sessionToken) throw new Error("Sign in to upload images");

            const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL;
            if (!apiBaseUrl) throw new Error("NEXT_PUBLIC_API_URL is required");

            const formData = new FormData();
            formData.set("file", file);
            formData.set("siteId", params.siteId);

            return new Promise<string>((resolve, reject) => {
              const request = new XMLHttpRequest();
              request.open("POST", `${apiBaseUrl.replace(/\/$/, "")}/upload`);
              request.setRequestHeader("Authorization", `Bearer ${sessionToken}`);
              request.responseType = "json";
              request.upload.onprogress = (event) => {
                if (event.lengthComputable) {
                  onProgress?.({ progress: Math.round((event.loaded / event.total) * 100) });
                }
              };
              request.onload = () => {
                try {
                  if (request.status < 200 || request.status >= 300) {
                    const body = Schema.decodeUnknownSync(
                      Schema.Struct({ message: Schema.String }),
                    )(request.response);
                    reject(new Error(body.message));
                    return;
                  }
                  const body = Schema.decodeUnknownSync(Schema.Struct({ url: Schema.String }))(
                    request.response,
                  );
                  resolve(body.url);
                } catch {
                  reject(new Error(`Upload failed (${request.status}): invalid response`));
                }
              };
              request.onerror = () =>
                reject(new Error("Image upload failed. Check your connection."));
              request.onabort = () => reject(new DOMException("Upload cancelled", "AbortError"));
              const abort = () => request.abort();
              signal?.addEventListener("abort", abort, { once: true });
              request.onloadend = () => signal?.removeEventListener("abort", abort);
              request.send(formData);
            });
          }}
          onBrickActivate={({ brickId }) => {
            void router.push(
              `/${encodeURIComponent(params.username)}/site/${encodeURIComponent(params.siteId)}/page/${encodeURIComponent(params.pageId)}/brick/${encodeURIComponent(brickId)}`,
              { scroll: false },
            );
          }}
        />
      </div>
    </div>
  );
}
