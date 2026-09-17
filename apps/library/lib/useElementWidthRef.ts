"use client";

import { useCallback, useEffect, useRef } from "react";
import type { RefCallback } from "react";

/** Observe an element's border-box width via ResizeObserver; returns a callback ref. */
export function useElementWidthRef(onWidth: (width: number) => void): RefCallback<HTMLElement> {
  const onWidthRef = useRef(onWidth);
  useEffect(() => {
    onWidthRef.current = onWidth;
  });

  return useCallback<RefCallback<HTMLElement>>(element => {
    if (!element) return;

    const notify = () => {
      onWidthRef.current(element.getBoundingClientRect().width);
    };
    notify();
    const observer = new ResizeObserver(notify);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
}
