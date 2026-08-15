import { useEffect, useState } from 'react';

import * as Dialog from '@radix-ui/react-dialog';
import { useRegisterSW } from 'virtual:pwa-register/react';

export function AppUpdateDialog() {
  const [error, setError] = useState<Error | null>(null);
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' && navigator.onLine,
  );
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisterError: cause => {
      setError(cause instanceof Error ? cause : new Error(String(cause)));
    },
  });

  useEffect(() => {
    const eventController = new window.AbortController();

    window.addEventListener('online', () => setIsOnline(navigator.onLine), {
      signal: eventController.signal,
    });
    window.addEventListener('offline', () => setIsOnline(navigator.onLine), {
      signal: eventController.signal,
    });

    return () => eventController.abort();
  }, []);

  return (
    <Dialog.Root
      open={needRefresh || error !== null}
      onOpenChange={open => {
        if (!open) {
          setNeedRefresh(false);
          setError(null);
        }
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-background p-6 shadow-lg">
          <Dialog.Title className="text-lg font-semibold">
            {needRefresh ? 'An update is ready' : 'Update check failed'}
          </Dialog.Title>
          <Dialog.Description className="mt-2 text-sm text-muted-foreground">
            {needRefresh
              ? 'Refresh to activate the latest shopping application.'
              : 'The current application remains available.'}
          </Dialog.Description>
          {error !== null ? (
            <p className="mt-3 text-sm text-destructive" role="alert">
              {error.message}
            </p>
          ) : null}
          <div className="mt-6 flex justify-end gap-2">
            <Dialog.Close asChild>
              <button
                type="button"
                className="inline-flex h-9 items-center justify-center rounded-md border px-4 text-sm font-medium"
              >
                Later
              </button>
            </Dialog.Close>
            {needRefresh ? (
              <button
                type="button"
                className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!isOnline}
                onClick={() => {
                  if (navigator.onLine) {
                    void updateServiceWorker(true);
                  }
                }}
              >
                Refresh now
              </button>
            ) : null}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
