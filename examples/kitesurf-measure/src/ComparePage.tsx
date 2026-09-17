import { useCallback, useEffect, useRef, useState } from "react";

import {
  BREAKPOINTS,
  isBreakpointId,
  minGridUnits,
  resolveBreakpointEntry,
} from "./breakpoints";

function readSize(element: Element) {
  const bounds = element.getBoundingClientRect();
  return {
    widthPx: Math.round(bounds.width),
    heightPx: Math.round(bounds.height),
  };
}

function waitForIframeReady(iframe: HTMLIFrameElement) {
  return new Promise<{ widthPx: number; heightPx: number }>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      cleanup();
      reject(new Error("Timed out waiting for /render readiness in the iframe."));
    }, 30_000);

    function cleanup() {
      window.clearTimeout(timeoutId);
      window.clearInterval(pollId);
    }

    function inspect() {
      const doc = iframe.contentDocument;
      if (doc === null) return;
      const root = doc.querySelector("[data-measure-root]");
      if (root === null) return;
      const ready = root.getAttribute("data-measure-ready");
      if (ready === "failed") {
        const message =
          doc.querySelector("[data-measure-error]")?.textContent ??
          "Render page reported readiness failure.";
        cleanup();
        reject(new Error(message));
        return;
      }
      if (ready === "ok") {
        cleanup();
        resolve(readSize(root));
      }
    }

    const pollId = window.setInterval(inspect, 100);
    iframe.addEventListener("load", inspect);
    inspect();
  });
}

export function ComparePage() {
  const [breakpoint, setBreakpoint] =
    useState<(typeof BREAKPOINTS)[number]["id"]>("sm");
  const [localSize, setLocalSize] = useState<{
    widthPx: number;
    heightPx: number;
  } | null>(null);
  const [remoteSize, setRemoteSize] = useState<{
    widthPx: number;
    heightPx: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [measuring, setMeasuring] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const entry = resolveBreakpointEntry(breakpoint);
  const renderSrc = `/render?breakpoint=${breakpoint}`;

  useEffect(() => {
    const iframe = iframeRef.current;
    if (iframe === null) return;

    let cancelled = false;
    void waitForIframeReady(iframe)
      .then((size) => {
        if (!cancelled) setLocalSize(size);
      })
      .catch((cause) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : String(cause));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [breakpoint]);

  function selectBreakpoint(next: (typeof BREAKPOINTS)[number]["id"]) {
    setBreakpoint(next);
    setLocalSize(null);
    setRemoteSize(null);
    setError(null);
  }

  const measureWithKitesurf = useCallback(async () => {
    setMeasuring(true);
    setError(null);
    setRemoteSize(null);

    try {
      const response = await fetch("/measure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ breakpoint }),
      });
      const payload: unknown = await response.json();
      if (
        payload === null ||
        typeof payload !== "object" ||
        Array.isArray(payload)
      ) {
        throw new Error("Measure endpoint returned a non-object body.");
      }

      if (!response.ok || "error" in payload) {
        const message =
          "error" in payload && typeof payload.error === "string"
            ? payload.error
            : `Measure failed with HTTP ${response.status}.`;
        throw new Error(message);
      }

      if (
        !("widthPx" in payload) ||
        !("heightPx" in payload) ||
        typeof payload.widthPx !== "number" ||
        typeof payload.heightPx !== "number" ||
        !Number.isFinite(payload.widthPx) ||
        !Number.isFinite(payload.heightPx)
      ) {
        throw new Error("Measure endpoint returned missing or invalid dimensions.");
      }

      setRemoteSize({
        widthPx: Math.round(payload.widthPx),
        heightPx: Math.round(payload.heightPx),
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setMeasuring(false);
    }
  }, [breakpoint]);

  const gridItemWidth = entry?.gridItemWidth ?? 45;
  const localGrid =
    localSize === null
      ? null
      : {
          w: minGridUnits(gridItemWidth, localSize.widthPx),
          h: minGridUnits(gridItemWidth, localSize.heightPx),
        };
  const remoteGrid =
    remoteSize === null
      ? null
      : {
          w: minGridUnits(gridItemWidth, remoteSize.widthPx),
          h: minGridUnits(gridItemWidth, remoteSize.heightPx),
        };

  return (
    <main style={{ padding: 24, display: "grid", gap: 24, maxWidth: 960 }}>
      <header style={{ display: "grid", gap: 8 }}>
        <h1 style={{ margin: 0, fontSize: 20 }}>Kitesurf brick measurement</h1>
        <p style={{ margin: 0, color: "#52525b" }}>
          Compare local browser dimensions of the GitHub profile brick with Cloudflare
          Kitesurf scrape measurements.
        </p>
      </header>

      <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
        Breakpoint
        <select
          value={breakpoint}
          onChange={(event) => {
            const next = event.target.value;
            if (isBreakpointId(next)) selectBreakpoint(next);
          }}
        >
          {BREAKPOINTS.map((row) => (
            <option key={row.id} value={row.id}>
              {row.id} ({row.previewWidth}px viewport, {row.gridItemWidth}px grid)
            </option>
          ))}
        </select>
      </label>

      <section style={{ display: "grid", gap: 12 }}>
        <h2 style={{ margin: 0, fontSize: 16 }}>/render iframe</h2>
        <iframe
          key={breakpoint}
          ref={iframeRef}
          title="Brick render"
          src={renderSrc}
          style={{
            width: entry?.previewWidth ?? 360,
            height: 420,
            border: "1px solid #d4d4d8",
            background: "#fff",
          }}
        />
      </section>

      <section style={{ display: "grid", gap: 12 }}>
        <button type="button" disabled={measuring} onClick={() => void measureWithKitesurf()}>
          {measuring ? "Measuring…" : "Measure with Kitesurf"}
        </button>
        {error === null ? null : (
          <p role="alert" style={{ color: "#b91c1c", margin: 0 }}>
            {error}
          </p>
        )}
        <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 14 }}>
          <thead>
            <tr>
              <th align="left" style={{ borderBottom: "1px solid #d4d4d8", padding: 8 }}>
                Source
              </th>
              <th align="right" style={{ borderBottom: "1px solid #d4d4d8", padding: 8 }}>
                widthPx
              </th>
              <th align="right" style={{ borderBottom: "1px solid #d4d4d8", padding: 8 }}>
                heightPx
              </th>
              <th align="right" style={{ borderBottom: "1px solid #d4d4d8", padding: 8 }}>
                w (grid)
              </th>
              <th align="right" style={{ borderBottom: "1px solid #d4d4d8", padding: 8 }}>
                h (grid)
              </th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ padding: 8 }}>Local iframe</td>
              <td align="right" style={{ padding: 8 }}>
                {localSize?.widthPx ?? "—"}
              </td>
              <td align="right" style={{ padding: 8 }}>
                {localSize?.heightPx ?? "—"}
              </td>
              <td align="right" style={{ padding: 8 }}>
                {localGrid?.w ?? "—"}
              </td>
              <td align="right" style={{ padding: 8 }}>
                {localGrid?.h ?? "—"}
              </td>
            </tr>
            <tr>
              <td style={{ padding: 8 }}>Kitesurf remote</td>
              <td align="right" style={{ padding: 8 }}>
                {remoteSize?.widthPx ?? "—"}
              </td>
              <td align="right" style={{ padding: 8 }}>
                {remoteSize?.heightPx ?? "—"}
              </td>
              <td align="right" style={{ padding: 8 }}>
                {remoteGrid?.w ?? "—"}
              </td>
              <td align="right" style={{ padding: 8 }}>
                {remoteGrid?.h ?? "—"}
              </td>
            </tr>
            <tr>
              <td style={{ padding: 8 }}>Δ (remote − local)</td>
              <td align="right" style={{ padding: 8 }}>
                {localSize && remoteSize ? remoteSize.widthPx - localSize.widthPx : "—"}
              </td>
              <td align="right" style={{ padding: 8 }}>
                {localSize && remoteSize ? remoteSize.heightPx - localSize.heightPx : "—"}
              </td>
              <td align="right" style={{ padding: 8 }}>
                {localGrid && remoteGrid ? remoteGrid.w - localGrid.w : "—"}
              </td>
              <td align="right" style={{ padding: 8 }}>
                {localGrid && remoteGrid ? remoteGrid.h - localGrid.h : "—"}
              </td>
            </tr>
          </tbody>
        </table>
        {localGrid && remoteGrid ? (
          <p style={{ margin: 0, color: "#52525b" }}>
            Grid units agree:{" "}
            {localGrid.w === remoteGrid.w && localGrid.h === remoteGrid.h ? "yes" : "no"}
          </p>
        ) : null}
      </section>
    </main>
  );
}
