"use client";

import { useLayoutEffect, useRef, useState } from "react";

import type { imageCropSchema } from "../image/definition/imageV2";

export function CroppedImage(props: {
  src: string;
  alt: string;
  crop: typeof imageCropSchema.Type;
  onPan?: (dx: number, dy: number) => void;
  onLoad?: () => void;
  onError?: () => void;
}) {
  const { src, alt, crop, onPan, onLoad, onError } = props;
  const frame = useRef<HTMLDivElement>(null);
  const pointer = useRef<{ id: number; x: number; y: number } | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [natural, setNatural] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const element = frame.current;
    if (element === null) return;
    const measure = () => setSize({ width: element.clientWidth, height: element.clientHeight });
    const observer = new ResizeObserver(measure);
    measure();
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const scale =
    natural.width > 0 && natural.height > 0
      ? Math.max(size.width / natural.width, size.height / natural.height) * crop.zoom
      : 0;
  const width = natural.width * scale;
  const height = natural.height * scale;
  const left = Math.min(0, Math.max(size.width - width, size.width / 2 - crop.x * width));
  const top = Math.min(0, Math.max(size.height - height, size.height / 2 - crop.y * height));

  return (
    <div
      ref={frame}
      className={
        onPan === undefined
          ? "absolute inset-0 overflow-hidden"
          : "absolute inset-0 touch-none cursor-grab overflow-hidden active:cursor-grabbing"
      }
      onPointerDown={
        onPan === undefined
          ? undefined
          : (event) => {
              if (event.button !== 0) return;
              event.currentTarget.setPointerCapture(event.pointerId);
              pointer.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
            }
      }
      onPointerMove={
        onPan === undefined
          ? undefined
          : (event) => {
              const previous = pointer.current;
              if (previous?.id !== event.pointerId || width <= 0 || height <= 0) return;
              pointer.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
              const x = (size.width / 2 - left) / width;
              const y = (size.height / 2 - top) / height;
              onPan(
                x - (event.clientX - previous.x) / width,
                y - (event.clientY - previous.y) / height,
              );
            }
      }
      onLostPointerCapture={() => {
        pointer.current = null;
      }}
    >
      <img
        src={src}
        alt={alt}
        draggable={false}
        className="pointer-events-none absolute max-w-none select-none"
        style={
          scale > 0
            ? { width, height, left, top }
            : { width: "100%", height: "100%", objectFit: "cover" }
        }
        onLoad={(event) => {
          setNatural({
            width: event.currentTarget.naturalWidth,
            height: event.currentTarget.naturalHeight,
          });
          onLoad?.();
        }}
        onError={onError}
      />
    </div>
  );
}
