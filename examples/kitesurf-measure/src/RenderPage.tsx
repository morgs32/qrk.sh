import { useEffect, useState } from "react";

import {
  BREAKPOINTS,
  isBreakpointId,
  resolveBreakpointEntry,
} from "./breakpoints";
import { PopulatedGitHubProfileBrick } from "./PopulatedGitHubProfileBrick";

function readBreakpointFromSearch(): (typeof BREAKPOINTS)[number]["id"] {
  const raw = new URLSearchParams(window.location.search).get("breakpoint") ?? "sm";
  if (isBreakpointId(raw)) return raw;
  return "sm";
}

export function RenderPage() {
  const breakpoint = readBreakpointFromSearch();
  const entry = resolveBreakpointEntry(breakpoint);
  const invalidBreakpointMessage =
    entry === undefined ? `Unknown breakpoint: ${breakpoint}` : null;
  const [readyState, setReadyState] = useState<"pending" | "ok" | "failed">(
    invalidBreakpointMessage === null ? "pending" : "failed",
  );
  const [failure, setFailure] = useState<string | null>(invalidBreakpointMessage);

  useEffect(() => {
    if (invalidBreakpointMessage !== null) return;

    let cancelled = false;

    async function markReady() {
      try {
        await document.fonts.ready;

        const images = Array.from(
          document.querySelectorAll<HTMLImageElement>("[data-measure-root] img"),
        );
        if (images.length === 0) {
          throw new Error("Avatar image element was not found after commit.");
        }

        for (const image of images) {
          if (!image.complete || image.naturalWidth === 0) {
            await new Promise<void>((resolve, reject) => {
              const onLoad = () => {
                cleanup();
                resolve();
              };
              const onError = () => {
                cleanup();
                reject(new Error("Avatar failed to load."));
              };
              const cleanup = () => {
                image.removeEventListener("load", onLoad);
                image.removeEventListener("error", onError);
              };
              image.addEventListener("load", onLoad);
              image.addEventListener("error", onError);
            });
          }
          if (typeof image.decode === "function") {
            await image.decode();
          }
          if (image.naturalWidth === 0) {
            throw new Error("Avatar decoded with zero natural width.");
          }
        }

        if (!cancelled) {
          setReadyState("ok");
          setFailure(null);
        }
      } catch (cause) {
        if (!cancelled) {
          setReadyState("failed");
          setFailure(cause instanceof Error ? cause.message : String(cause));
        }
      }
    }

    void markReady();
    return () => {
      cancelled = true;
    };
  }, [breakpoint, invalidBreakpointMessage]);

  const previewWidth = entry?.previewWidth ?? 360;

  return (
    <div
      style={{
        width: previewWidth,
        minHeight: "100vh",
        margin: 0,
        padding: 0,
        background: "#f4f4f5",
      }}
    >
      <div
        data-measure-root
        data-measure-ready={readyState}
        data-measure-breakpoint={breakpoint}
        className="qrk-bricks"
        style={{ width: "max-content", height: "max-content" }}
      >
        <PopulatedGitHubProfileBrick breakpoint={breakpoint} />
      </div>
      {failure === null ? null : (
        <p data-measure-error role="alert" style={{ color: "#b91c1c", padding: 16 }}>
          Render readiness failed: {failure}
        </p>
      )}
    </div>
  );
}
