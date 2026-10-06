'use client';

import { useEffect, useRef } from 'react';

/** Mount once near the application root to own the DevTools shell lifetime. */
export function ZerospinDevtoolsLoader(props: { defaultOpen?: boolean }) {
  const { defaultOpen = false } = props;
  const defaultOpenRef = useRef(defaultOpen);

  useEffect(() => {
    let isCancelled = false;
    let dispose: (() => void) | null = null;

    // Deferring the load lets cleanup cancel StrictMode's first effect.
    void import('./loadDevtools/loadDevtools.js')
      .then(async ({ loadDevtools }) => {
        if (isCancelled) return;

        const devtools = await loadDevtools({
          defaultOpen: defaultOpenRef.current,
        });
        if (isCancelled) {
          devtools.dispose();
        } else {
          dispose = devtools.dispose;
        }
      })
      .catch((error: unknown) => {
        console.error('Failed to load Zerospin DevTools', error);
      });

    return () => {
      isCancelled = true;
      dispose?.();
    };
  }, []);

  return null;
}
