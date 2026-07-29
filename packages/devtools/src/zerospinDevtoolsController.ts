let loadZerospinDevtools: (() => Promise<void>) | null = null;
let openMountedZerospinDevtools: (() => Promise<void>) | null = null;
let openingZerospinDevtools: Promise<void> | null = null;
let openingZerospinDevtoolsLoader: (() => Promise<void>) | null = null;

/*
 * 1. ZerospinConfig registers the one lazy shell loader for its mounted lifetime.
 * 2. ZerospinDevtools registers the one already-mounted shell open callback.
 * 3. Console callers share one open operation, preferring the mounted shell.
 * 4. Both registrations use identity-checked cleanup so stale owners cannot clear replacements.
 */
export const zerospinDevtoolsController = {
  registerLoader(load: () => Promise<void>) {
    let rejectPendingLoad: ((error: unknown) => void) | null = null;

    const registeredLoad = () =>
      new Promise<void>((resolve, reject) => {
        rejectPendingLoad = reject;

        void load().then(
          () => {
            rejectPendingLoad = null;
            resolve();
          },
          error => {
            rejectPendingLoad = null;
            reject(error);
          },
        );
      });

    loadZerospinDevtools = registeredLoad;

    return () => {
      if (loadZerospinDevtools === registeredLoad) {
        loadZerospinDevtools = null;
      }

      const reject = rejectPendingLoad;
      rejectPendingLoad = null;
      reject?.(
        new Error(
          'ZerospinConfig unmounted before Zerospin DevTools finished loading.',
        ),
      );

      if (openingZerospinDevtoolsLoader === registeredLoad) {
        openingZerospinDevtools = null;
        openingZerospinDevtoolsLoader = null;
      }
    };
  },

  registerShell(open: () => Promise<void>) {
    openMountedZerospinDevtools = open;

    return () => {
      if (openMountedZerospinDevtools === open) {
        openMountedZerospinDevtools = null;
      }
    };
  },

  open(): Promise<void> {
    if (openingZerospinDevtools !== null) {
      return openingZerospinDevtools;
    }

    const opening = (async () => {
      if (openMountedZerospinDevtools === null) {
        const registeredLoad = loadZerospinDevtools;
        if (registeredLoad === null) {
          throw new Error(
            'ZerospinConfig must be mounted before opening Zerospin DevTools.',
          );
        }

        openingZerospinDevtoolsLoader = registeredLoad;
        await registeredLoad();
      }

      if (openMountedZerospinDevtools === null) {
        throw new Error('Zerospin DevTools loaded without mounting its shell.');
      }

      await openMountedZerospinDevtools();
    })();

    openingZerospinDevtools = opening;
    void opening.then(
      () => {
        if (openingZerospinDevtools === opening) {
          openingZerospinDevtools = null;
          openingZerospinDevtoolsLoader = null;
        }
      },
      () => {
        if (openingZerospinDevtools === opening) {
          openingZerospinDevtools = null;
          openingZerospinDevtoolsLoader = null;
        }
      },
    );

    return opening;
  },
};
