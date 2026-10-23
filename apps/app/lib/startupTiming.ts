import { isZerospinError } from "@zerospin/error";
import {
  makeTelemetryCollector,
  makeTelemetryLogger,
  type ITelemetryBatch,
  type ITelemetryCollector,
} from "@zerospin/logger";
import { Effect, Logger } from "effect";

const navigationId = import.meta.env.DEV ? crypto.randomUUID() : "";
let startupId = "";
let startedAt = 0;
let sessionOwner: object | null = null;
let sessionStartupId: string | null = null;
let collector = makeTelemetryCollector();
let terminal: "ready" | "failed" | "cancelled" | null = null;
let attemptCount = 0;
let layoutOwners = 0;
let layoutRevision = 0;
let phases = new Set<string>();
let durations: Record<string, number> = {};

function logStartup(props: {
  phase: string;
  outcome: "ready" | "failed" | "cancelled";
  elapsedMs: number;
  errorCode?: string;
}) {
  const { phase, outcome, elapsedMs, errorCode } = props;
  try {
    Effect.runSync(
      Effect.logInfo(phase === "startup.summary" ? "App startup summary" : "App startup").pipe(
        Effect.annotateLogs({
          navigationId,
          startupId,
          sessionStartupId,
          phase,
          outcome,
          elapsedMs,
          navigationElapsedMs: performance.now(),
          clockDomain: "window",
          ...(errorCode === undefined ? {} : { errorCode }),
          ...(phase === "startup.summary" ? { durations } : {}),
        }),
        Effect.provide(Logger.layer([makeTelemetryLogger(collector)], { mergeWithExisting: true })),
      ),
    );
  } catch {
    // Diagnostics must not change authentication, rendering or readiness outcomes.
  }
}

function beginStartup() {
  startupId = crypto.randomUUID();
  // The first attempt includes the time before the application module was evaluated.
  startedAt = attemptCount === 0 ? 0 : performance.now();
  attemptCount += 1;
  sessionOwner = null;
  sessionStartupId = null;
  collector = makeTelemetryCollector();
  terminal = null;
  phases = new Set();
  durations = {};
}

function finishStartup(outcome: "ready" | "failed" | "cancelled", errorCode?: string) {
  if (!import.meta.env.DEV || startupId === "" || terminal !== null) return;
  terminal = outcome;
  logStartup({
    phase: "startup.summary",
    outcome,
    elapsedMs: performance.now() - startedAt,
    errorCode,
  });
}

function recordNavigationTimings() {
  if (!import.meta.env.DEV || startupId === "" || terminal !== null) return;
  const navigation = performance.getEntriesByType("navigation")[0];
  if (navigation instanceof PerformanceNavigationTiming) {
    if (navigation.responseEnd > 0 && !phases.has("navigation.html")) {
      phases.add("navigation.html");
      durations["navigation.html"] = navigation.responseEnd - navigation.startTime;
      logStartup({
        phase: "navigation.html",
        outcome: "ready",
        elapsedMs: durations["navigation.html"],
      });
    }
    if (navigation.domContentLoadedEventEnd > 0 && !phases.has("navigation.dom")) {
      phases.add("navigation.dom");
      durations["navigation.dom"] = navigation.domContentLoadedEventEnd - navigation.startTime;
      logStartup({
        phase: "navigation.dom",
        outcome: "ready",
        elapsedMs: durations["navigation.dom"],
      });
    }
  }
  const paint = performance.getEntriesByName("first-contentful-paint", "paint")[0];
  if (paint !== undefined && !phases.has("navigation.first-contentful-paint")) {
    phases.add("navigation.first-contentful-paint");
    durations["navigation.first-contentful-paint"] = paint.startTime;
    logStartup({
      phase: "navigation.first-contentful-paint",
      outcome: "ready",
      elapsedMs: paint.startTime,
    });
  }
}

/** Development startup facts owned by this document and its mounted user layout. */
export const startupTiming = {
  observeDocument() {
    if (!import.meta.env.DEV) return;
    const observer = new PerformanceObserver(recordNavigationTimings);
    observer.observe({ type: "navigation", buffered: true });
    observer.observe({ type: "paint", buffered: true });
    const onPageHide = () => finishStartup("cancelled", "document-left");
    window.addEventListener("pagehide", onPageHide);
    return () => {
      observer.disconnect();
      window.removeEventListener("pagehide", onPageHide);
    };
  },
  mountUserLayout() {
    if (!import.meta.env.DEV) return;
    layoutOwners += 1;
    layoutRevision += 1;
    if (startupId === "") beginStartup();
    recordNavigationTimings();
    return () => {
      layoutOwners -= 1;
      const revision = ++layoutRevision;
      // React's development effect replay reacquires ownership before this runs.
      queueMicrotask(() => {
        if (layoutOwners === 0 && layoutRevision === revision) {
          finishStartup("cancelled", "user-layout-unmounted");
          sessionOwner = null;
          sessionStartupId = null;
          collector = makeTelemetryCollector();
          startupId = "";
        }
      });
    };
  },
  clerkReady(signedIn: boolean) {
    if (!import.meta.env.DEV) return;
    if (startupId === "") beginStartup();
    if (terminal !== null || phases.has("clerk.ready")) return;
    phases.add("clerk.ready");
    durations["clerk.ready"] = performance.now() - startedAt;
    logStartup({ phase: "clerk.ready", outcome: "ready", elapsedMs: durations["clerk.ready"] });
    if (!signedIn) finishStartup("cancelled", "signed-out");
  },
  observeSession(props: {
    session: object;
    telemetryCollector: ITelemetryCollector;
    telemetry: ITelemetryBatch;
    status: string;
    failure: unknown;
  }) {
    const { session, telemetryCollector, telemetry, status, failure } = props;
    if (!import.meta.env.DEV) return;
    if (startupId === "" || (sessionOwner === null && terminal !== null)) beginStartup();
    if (sessionOwner !== session) {
      if (sessionOwner !== null) {
        finishStartup("cancelled", "session-replaced");
        beginStartup();
        recordNavigationTimings();
      }
      sessionOwner = session;
      const preceding = collector.flush();
      collector = telemetryCollector;
      try {
        collector.merge(preceding);
      } catch {
        // A diagnostic observer cannot fail session startup.
      }
    }
    const start = telemetry.logs.findLast((log) => {
      const payload = log.payload;
      return (
        payload !== null &&
        typeof payload === "object" &&
        "phase" in payload &&
        payload.phase === "session.initialize" &&
        "startupId" in payload &&
        typeof payload.startupId === "string"
      );
    });
    const payload = start?.payload;
    if (
      payload !== null &&
      typeof payload === "object" &&
      "startupId" in payload &&
      typeof payload.startupId === "string" &&
      payload.startupId !== sessionStartupId
    ) {
      sessionStartupId = payload.startupId;
      if (terminal === null)
        logStartup({
          phase: "session.correlated",
          outcome: "ready",
          elapsedMs: performance.now() - startedAt,
        });
    }
    if (status === "ready" && !phases.has("session.ready") && terminal === null) {
      phases.add("session.ready");
      durations["session.ready"] = performance.now() - startedAt;
      logStartup({
        phase: "session.ready",
        outcome: "ready",
        elapsedMs: durations["session.ready"],
      });
    }
    if (status === "failed")
      finishStartup("failed", isZerospinError(failure) ? failure.code : "session-startup-failed");
    // The layout owns cancellation. A transient disposed state also occurs
    // during React's effect replay while the same owner is being restarted.
  },
  credentialsStarted() {
    if (!import.meta.env.DEV) return null;
    if (startupId === "") beginStartup();
    return { startupId, startedAt: performance.now() };
  },
  credentialsCompleted(props: {
    acquisition: { startupId: string; startedAt: number } | null;
    outcome: "ready" | "failed" | "cancelled";
    error?: unknown;
  }) {
    const { acquisition, outcome, error } = props;
    if (
      !import.meta.env.DEV ||
      acquisition === null ||
      acquisition.startupId !== startupId ||
      terminal !== null
    )
      return;
    const elapsedMs = performance.now() - acquisition.startedAt;
    durations["credentials.acquire"] = elapsedMs;
    logStartup({
      phase: "credentials.acquire",
      outcome,
      elapsedMs,
      ...(outcome === "ready"
        ? {}
        : { errorCode: isZerospinError(error) ? error.code : "credentials-unavailable" }),
    });
  },
  dashboardCommitted(hasUser: boolean) {
    if (!import.meta.env.DEV || startupId === "" || terminal !== null) return;
    if (!hasUser) {
      finishStartup("failed", "dashboard-user-not-found");
      return;
    }
    durations["dashboard.commit"] = performance.now() - startedAt;
    logStartup({
      phase: "dashboard.commit",
      outcome: "ready",
      elapsedMs: durations["dashboard.commit"],
    });
    recordNavigationTimings();
    finishStartup("ready");
  },
  failed(error: unknown) {
    if (!import.meta.env.DEV) return;
    if (startupId === "") beginStartup();
    finishStartup("failed", isZerospinError(error) ? error.code : "app-startup-failed");
  },
};
