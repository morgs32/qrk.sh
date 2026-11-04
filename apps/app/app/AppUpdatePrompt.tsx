"use client";

import { useEffect } from "react";
import { toast } from "sonner";

export function AppUpdatePrompt() {
  useEffect(() => {
    if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;

    let disposed = false;
    let registration: ServiceWorkerRegistration | undefined;
    let reloadApproved = false;
    let applyUpdate: ((reloadPage?: boolean) => Promise<void>) | undefined;
    const clerkScripts = new Set<string>();
    const prepareOfflineResources = () => {
      if (navigator.serviceWorker.controller === null) return;
      navigator.serviceWorker.controller.postMessage({
        type: "QRK_APP_VERSION",
        moduleUrl: import.meta.url,
      });
      if (clerkScripts.size === 0) return;
      navigator.serviceWorker.controller.postMessage({
        type: "CACHE_URLS",
        payload: { urlsToCache: [...clerkScripts] },
      });
    };
    const resources = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const url = new URL(entry.name);
        if (
          url.protocol === "https:" &&
          url.pathname.startsWith("/npm/@clerk/") &&
          url.pathname.endsWith(".js")
        ) {
          clerkScripts.add(url.href);
        }
      }
      prepareOfflineResources();
    });
    resources.observe({ type: "resource", buffered: true });
    navigator.serviceWorker.addEventListener("controllerchange", prepareOfflineResources);

    const showUpdate = () => {
      if (disposed) return;
      toast("Update available", {
        id: "qrk-app-update",
        duration: Infinity,
        description: "Reload when you are ready to use the downloaded version.",
        action: {
          label: "Reload",
          onClick: () => {
            reloadApproved = true;
            if (registration?.waiting === null) {
              window.location.reload();
            } else {
              void applyUpdate?.(true).catch(() => {
                reloadApproved = false;
                toast.error("The update could not be applied. Try again.");
                showUpdate();
              });
            }
          },
        },
        cancel: { label: "Later", onClick: () => undefined },
      });
    };
    const checkForUpdate = () => {
      if (document.visibilityState !== "visible" || !navigator.onLine) return;
      prepareOfflineResources();
      void registration?.update().catch((error: unknown) => {
        console.error("QRK update check failed", error);
      });
    };
    document.addEventListener("visibilitychange", checkForUpdate);
    window.addEventListener("online", checkForUpdate);
    window.addEventListener("focus", checkForUpdate);
    void import("virtual:pwa-register")
      .then(({ registerSW }) => {
        if (disposed) return;
        applyUpdate = registerSW({
          immediate: true,
          onNeedRefresh: showUpdate,
          onNeedReload: () => {
            if (disposed) return;
            if (reloadApproved) window.location.reload();
            else showUpdate();
          },
          onRegisteredSW: (_url, value) => {
            registration = value;
            prepareOfflineResources();
          },
          onRegisterError: (error: unknown) => {
            console.error("QRK offline resources could not be prepared", error);
          },
        });
      })
      .catch((error: unknown) => {
        console.error("QRK offline registration could not be loaded", error);
      });

    return () => {
      disposed = true;
      resources.disconnect();
      navigator.serviceWorker.removeEventListener("controllerchange", prepareOfflineResources);
      document.removeEventListener("visibilitychange", checkForUpdate);
      window.removeEventListener("online", checkForUpdate);
      window.removeEventListener("focus", checkForUpdate);
      toast.dismiss("qrk-app-update");
    };
  }, []);

  return null;
}
