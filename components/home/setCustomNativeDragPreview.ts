"use client";

const PREVIEW_ROTATION_DEGREES = 4;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
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
  const previewRoot = document.createElement("div");
  const preview = source.cloneNode(true) as HTMLElement;
  const offset = getDragImageOffset(sourceRect, event);

  previewRoot.setAttribute("data-native-drag-preview-root", "true");
  Object.assign(previewRoot.style, {
    position: "fixed",
    left: "-10000px",
    top: "-10000px",
    pointerEvents: "none",
    zIndex: "2147483647",
  });

  preview.setAttribute("data-native-drag-preview", "tile");
  preview.setAttribute("aria-hidden", "true");
  preview.removeAttribute("id");
  preview.draggable = false;
  Object.assign(preview.style, {
    width: `${sourceRect.width}px`,
    height: `${sourceRect.height}px`,
    transform: `rotate(${PREVIEW_ROTATION_DEGREES}deg)`,
    transformOrigin: "center center",
    boxShadow: "0 18px 40px rgba(15, 23, 42, 0.24)",
    pointerEvents: "none",
  });

  previewRoot.appendChild(preview);
  document.body.appendChild(previewRoot);
  dataTransfer.setDragImage(preview, offset.x, offset.y);

  let cleanedUp = false;
  const cleanup = () => {
    if (cleanedUp) {
      return;
    }
    cleanedUp = true;
    previewRoot.remove();
  };

  requestAnimationFrame(() => {
    requestAnimationFrame(cleanup);
  });

  return cleanup;
}
