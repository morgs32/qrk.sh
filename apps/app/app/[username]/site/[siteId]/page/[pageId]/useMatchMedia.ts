import { useMemo, useSyncExternalStore } from "react";

export function useMatchMedia(query: string): boolean {
  const media = useMemo(() => {
    const list = window.matchMedia(query);
    return {
      subscribe: (onChange: () => void) => {
        list.addEventListener("change", onChange);
        return () => list.removeEventListener("change", onChange);
      },
      getSnapshot: () => list.matches,
    };
  }, [query]);

  return useSyncExternalStore(media.subscribe, media.getSnapshot);
}
