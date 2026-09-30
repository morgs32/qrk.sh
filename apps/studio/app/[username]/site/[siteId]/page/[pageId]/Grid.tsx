"use client";

import { useAuth } from "@clerk/nextjs";
import { useState } from "react";
import { toast } from "sonner";
import { useRouter, useSelectedLayoutSegments } from "next/navigation";
import { useReducedMotion } from "framer-motion";

import { BrickWall } from "@qrk.sh/library/BrickWall";
import { BREAKPOINTS } from "@qrk.sh/library/breakpoints";
import { WallBreakpointPane } from "@qrk.sh/library/WallBreakpointPane";
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
  const { activeBreakpoint, setGridGesture } = useWallViewport();
  const session = useLibrarySession();
  const params = useValidatedParams(ParamsSchema);
  const router = useRouter();
  const segments = useSelectedLayoutSegments();
  const route = segments.find((segment) => !segment.startsWith("("));
  const [pendingText, setPendingText] = useState<{
    brickId: string;
    breakpoint: "sm" | "md" | "lg" | "xl";
  } | null>(null);
  const { getToken } = useAuth();
  const [activeText, setActiveText] = useState<{
    brickId: string;
    breakpoint: "sm" | "md" | "lg" | "xl";
  } | null>(null);
  const reducedMotion = useReducedMotion() ?? false;
  const [transition, setTransition] = useState<{
    active: (typeof BREAKPOINTS)[number]["id"] | null;
    from: (typeof BREAKPOINTS)[number]["id"] | null;
    direction: 1 | -1 | 0;
    version: number;
  }>({ active: null, from: null, direction: 0, version: 0 });
  if (transition.active !== activeBreakpoint) {
    setTransition({
      active: activeBreakpoint,
      from: transition.active !== null && activeBreakpoint !== null ? transition.active : null,
      direction:
        transition.active !== null && activeBreakpoint !== null
          ? BREAKPOINTS.findIndex((row) => row.id === activeBreakpoint) >
            BREAKPOINTS.findIndex((row) => row.id === transition.active)
            ? 1
            : -1
          : 0,
      version: transition.version + 1,
    });
  }
  const fromBreakpoint = transition.active === activeBreakpoint ? transition.from : null;
  const direction = transition.active === activeBreakpoint ? transition.direction : 0;
  if (activeText !== null && activeText.breakpoint !== activeBreakpoint) setActiveText(null);
  if (pendingText !== null && pendingText.breakpoint !== activeBreakpoint) setPendingText(null);

  if (pendingText !== null && route === undefined && pendingText.breakpoint === activeBreakpoint) {
    setActiveText(pendingText);
    setPendingText(null);
  }

  return (
    <div className="min-h-full w-full" data-testid="grid-region">
      <div className="relative min-h-full w-full" data-testid="grid-layout">
        {BREAKPOINTS.map((row) => {
          const isActive = activeBreakpoint === row.id;
          const isOutgoing = fromBreakpoint === row.id && !isActive;
          return (
            <WallBreakpointPane
              key={row.id}
              breakpoint={row.id}
              previewWidth={row.previewWidth}
              isActive={isActive}
              isOutgoing={isOutgoing}
              isOnStage={isActive || isOutgoing}
              isTransitioning={fromBreakpoint !== null}
              direction={direction}
              reducedMotion={reducedMotion}
              onOutgoingComplete={() => {
                setTransition((current) =>
                  current.version === transition.version && current.from === row.id
                    ? { ...current, from: null }
                    : current,
                );
              }}
            >
              <BrickWall
                session={session}
                wallId={WALL_ID}
                breakpoint={row.id}
                gridWidth={row.previewWidth}
                isActive={isActive}
                activeTextBrickId={
                  isActive && activeText?.breakpoint === row.id ? activeText.brickId : null
                }
                onGestureChange={setGridGesture}
                onCommandError={(message) => toast.error(message)}
                onTextEditStart={(brickId) => {
                  setPendingText({ brickId, breakpoint: row.id });
                  router.push(
                    `/${encodeURIComponent(params.username)}/site/${encodeURIComponent(params.siteId)}/page/${encodeURIComponent(params.pageId)}`,
                    { scroll: false },
                  );
                }}
                onTextEditEnd={() =>
                  setActiveText((current) => (current?.breakpoint === row.id ? null : current))
                }
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
                        const body = Schema.decodeUnknownSync(
                          Schema.Struct({ url: Schema.String }),
                        )(request.response);
                        resolve(body.url);
                      } catch {
                        reject(new Error(`Upload failed (${request.status}): invalid response`));
                      }
                    };
                    request.onerror = () =>
                      reject(new Error("Image upload failed. Check your connection."));
                    request.onabort = () =>
                      reject(new DOMException("Upload cancelled", "AbortError"));
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
            </WallBreakpointPane>
          );
        })}
      </div>
    </div>
  );
}
