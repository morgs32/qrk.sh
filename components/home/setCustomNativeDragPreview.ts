"use client";

const PREVIEW_ROTATION_DEGREES = 12;
/** Matches `preview` box-shadow: offset-y + blur (used to size the drag canvas). */
const PREVIEW_SHADOW_OFFSET_Y_PX = 18;
const PREVIEW_SHADOW_BLUR_PX = 40;
/** Padding inside canvas so the rasterized drag image is not tight to the edge. */
const PREVIEW_CANVAS_EDGE_SLACK_PX = 12;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

/** Cloned tile keeps layout clipping (overflow, clip-path, contain) that survives `cloneNode`. */
function stripClippingOnSubtree(root: HTMLElement) {
  const nodes: Element[] = [root, ...root.querySelectorAll("*")];
  for (const el of nodes) {
    if (!("style" in el)) {
      continue;
    }
    const s = (el as HTMLElement | SVGElement).style;
    s.setProperty("overflow", "visible", "important");
    s.setProperty("overflow-x", "visible", "important");
    s.setProperty("overflow-y", "visible", "important");
    s.setProperty("clip-path", "none", "important");
    s.setProperty("clip", "auto", "important");
    s.setProperty("contain", "none", "important");
  }
}

/** Drag canvas size: pivot at tile center; include shadow + ring paint outside the w×h box. */
function computeDragCanvasSize(
  w: number,
  h: number,
  thetaRad: number,
): { canvasW: number; canvasH: number } {
  const blur = PREVIEW_SHADOW_BLUR_PX;
  const offY = PREVIEW_SHADOW_OFFSET_Y_PX;
  const s = PREVIEW_CANVAS_EDGE_SLACK_PX;
  const localCorners = [
    { x: -blur - s, y: -blur - s },
    { x: w + blur + s, y: -blur - s },
    { x: -blur - s, y: h + offY + blur + s },
    { x: w + blur + s, y: h + offY + blur + s },
  ];
  const cos = Math.cos(thetaRad);
  const sin = Math.sin(thetaRad);
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const { x: px, y: py } of localCorners) {
    const dx = px - w / 2;
    const dy = py - h / 2;
    const rx = dx * cos - dy * sin;
    const ry = dx * sin + dy * cos;
    minX = Math.min(minX, rx);
    maxX = Math.max(maxX, rx);
    minY = Math.min(minY, ry);
    maxY = Math.max(maxY, ry);
  }
  const canvasW = Math.ceil(Math.max(2 * (s - minX), 2 * (maxX + s)));
  const canvasH = Math.ceil(Math.max(2 * (s - minY), 2 * (maxY + s)));
  return { canvasW, canvasH };
}

function getDragImageOffset(sourceRect: DOMRect, event: DragEvent) {
  const fallbackX = sourceRect.width / 2;
  const fallbackY = sourceRect.height / 2;

  if (typeof event.clientX !== "number" || typeof event.clientY !== "number") {
    return { x: fallbackX, y: fallbackY };
  }

  return {
    x: clamp(event.clientX - sourceRect.left, 0, sourceRect.width),
    y: clamp(event.clientY - sourceRect.top, 0, sourceRect.height),
  };
}

export function setCustomNativeDragPreview({
  dataTransfer,
  source,
  event,
}: {
  dataTransfer: DataTransfer;
  source: HTMLElement;
  event: DragEvent;
}) {
  const sourceRect = source.getBoundingClientRect();
  const w = sourceRect.width;
  const h = sourceRect.height;
  const thetaRad = (PREVIEW_ROTATION_DEGREES * Math.PI) / 180;
  const { canvasW, canvasH } = computeDragCanvasSize(w, h, thetaRad);
  const tileOriginX = (canvasW - w) / 2;
  const tileOriginY = (canvasH - h) / 2;

  const previewRoot = document.createElement("div");
  const previewRotate = document.createElement("div");
  const previewFrame = document.createElement("div");
  const preview = source.cloneNode(true) as HTMLElement;
  const offset = getDragImageOffset(sourceRect, event);

  previewRoot.setAttribute("data-native-drag-preview-root", "true");
  previewRoot.setAttribute("data-native-drag-preview", "tile");
  Object.assign(previewRoot.style, {
    position: "fixed",
    left: "0",
    top: "0",
    width: `${canvasW}px`,
    height: `${canvasH}px`,
    pointerEvents: "none",
    zIndex: "2147483647",
    overflow: "visible",
    background: "transparent",
  });

  previewRotate.setAttribute("data-native-drag-preview-rotate", "true");
  Object.assign(previewRotate.style, {
    position: "absolute",
    left: `${tileOriginX}px`,
    top: `${tileOriginY}px`,
    width: `${w}px`,
    height: `${h}px`,
    transform: `rotate(${PREVIEW_ROTATION_DEGREES}deg)`,
    transformOrigin: "center center",
    pointerEvents: "none",
    background: "transparent",
  });

  previewFrame.setAttribute("data-native-drag-preview-frame", "true");
  Object.assign(previewFrame.style, {
    width: `${w}px`,
    height: `${h}px`,
    overflow: "visible",
    background: "transparent",
    pointerEvents: "none",
  });

  preview.setAttribute("data-native-drag-preview", "tile");
  preview.setAttribute("aria-hidden", "true");
  preview.removeAttribute("id");
  preview.draggable = false;
  Object.assign(preview.style, {
    width: `${w}px`,
    height: `${h}px`,
    boxShadow: "0 18px 40px rgba(15, 23, 42, 0.24)",
    pointerEvents: "none",
    overflow: "visible",
  });

  stripClippingOnSubtree(preview);

  previewFrame.appendChild(preview);
  previewRotate.appendChild(previewFrame);
  previewRoot.appendChild(previewRotate);
  document.body.appendChild(previewRoot);
  void previewRoot.offsetWidth;
  dataTransfer.setDragImage(previewRoot, tileOriginX + offset.x, tileOriginY + offset.y);
  previewRoot.style.left = "-10000px";

  let cleanedUp = false;
  const cleanup = () => {
    if (cleanedUp) {
      return;
    }
    cleanedUp = true;
    previewRoot.remove();
  };

  return cleanup;
}
