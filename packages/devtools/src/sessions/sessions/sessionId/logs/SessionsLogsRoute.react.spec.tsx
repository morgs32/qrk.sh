import { act } from "react";

import { main } from "@zerospin/core/fixtures/system";
import { makeSession } from "@zerospin/core/session/makeSession";
import type { ISessionId } from "@zerospin/core/session/types";
import type { ITelemetryBatch } from "@zerospin/logger";
import { Effect } from "effect";
import { createRoot, type Root } from "react-dom/client";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { zerospinDevtoolsStore } from "../../../../zerospinDevtoolsStore.js";

import { SessionsLogsRoute } from "./SessionsLogsRoute";

const sessionId: ISessionId = "sesn_logs";
const otherSessionId: ISessionId = "sesn_other_logs";

const initialTelemetry: ITelemetryBatch = {
  spans: [
    {
      spanId: "spn_old_root",
      traceId: "trc_old",
      parentSpanId: null,
      name: "old root",
      status: "ok",
      startedAt: 100,
      endedAt: 150,
      attributes: null,
    },
    {
      spanId: "spn_new_child",
      traceId: "trc_new",
      parentSpanId: "spn_new_root",
      name: "new child",
      status: "ok",
      startedAt: 210,
      endedAt: 260,
      attributes: {
        operation: "fetch",
        "function.arguments": [{ actorName: "shopper" }],
        "function.result": { actorId: "actor_one" },
      },
    },
    {
      spanId: "spn_new_root",
      traceId: "trc_new",
      parentSpanId: null,
      name: "new root",
      status: "error",
      startedAt: 200,
      endedAt: 280,
      attributes: null,
    },
  ],
  logs: [
    {
      logId: "lgr_child_later",
      createdAt: 240,
      level: "info",
      message: "child later",
      source: "browser",
      payload: null,
      traceId: "trc_new",
      spanId: "spn_new_child",
    },
    {
      logId: "lgr_child_earlier",
      createdAt: 220,
      level: "debug",
      message: "child earlier",
      source: "browser",
      payload: { sequence: 1 },
      traceId: "trc_new",
      spanId: "spn_new_child",
    },
    {
      logId: "lgr_unattached",
      createdAt: 250,
      level: "warn",
      message: "missing browser span",
      source: "browser",
      payload: null,
      traceId: "trc_new",
      spanId: "spn_missing",
    },
    {
      logId: "lgr_unscoped",
      createdAt: 90,
      level: "error",
      message: "outside a span",
      source: "browser",
      payload: null,
      traceId: null,
      spanId: null,
    },
  ],
  links: [
    {
      linkId: "lnk_attached",
      traceId: "trc_server_attached",
      spanId: "spn_server_attached",
      priorTraceId: "trc_new",
      priorSpanId: "spn_new_child",
      kind: "causedBy",
    },
    {
      linkId: "lnk_unattached",
      traceId: "trc_server_unattached",
      spanId: "spn_server_unattached",
      priorTraceId: "trc_new",
      priorSpanId: "spn_missing",
      kind: "causedBy",
    },
    {
      linkId: "lnk_link_only",
      traceId: "trc_server_link_only",
      spanId: "spn_server_link_only",
      priorTraceId: "trc_link_only",
      priorSpanId: "spn_link_only_missing",
      kind: "causedBy",
    },
  ],
};

describe("SessionsLogsRoute", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
      await Promise.resolve();
    });
    zerospinDevtoolsStore.getState().removeSession(sessionId);
    zerospinDevtoolsStore.getState().removeSession(otherSessionId);
    container.remove();
    vi.clearAllMocks();
  });

  it("renders and updates session-owned traces without losing the active selection", async () => {
    const session = makeSession({
      frontend: main,
      sessionId,
      generateSignature: () => Effect.succeed({ userId: "usr_1" }),
    });
    session.store.setState({ telemetry: initialTelemetry });
    zerospinDevtoolsStore.getState().addSession({
      session,
      pushStagedCommands: () =>
        Promise.resolve({
          pendingCommands: [],
          pushedCommands: [],
          failedCommands: [],
        }),
    });

    const router = createMemoryRouter(
      [
        {
          path: "/:sessionId/logs",
          element: <SessionsLogsRoute />,
        },
      ],
      { initialEntries: [`/${sessionId}/logs`] },
    );

    await act(async () => {
      root.render(<RouterProvider router={router} />);
      await Promise.resolve();
    });

    await vi.waitFor(() => {
      expect(container.querySelector('[data-testid="selected-trace"]')).not.toBeNull();
    });

    const initialTraceRows = container.querySelectorAll(
      '[data-testid^="trace-list-item-"]',
    );
    expect(initialTraceRows).toHaveLength(3);
    expect(initialTraceRows[0]?.textContent).toContain("trc_new");
    expect(initialTraceRows[1]?.textContent).toContain("trc_old");
    expect(initialTraceRows[2]?.textContent).toContain("trc_link_only");
    expect(initialTraceRows[2]?.textContent).toContain("No local timing");

    const selectedTrace = container.querySelector(
      '[data-testid="selected-trace"]',
    );
    expect(router.state.location.search).toBe("");
    expect(selectedTrace?.textContent).toContain("trc_new");
    expect(selectedTrace?.textContent).toContain("new root");
    expect(selectedTrace?.textContent).toContain("new child");
    expect(
      selectedTrace?.querySelector('[data-testid="span-spn_new_child"]'),
    ).not.toBeNull();

    const rootBar = selectedTrace?.querySelector<HTMLElement>(
      '[data-testid="span-waterfall-bar-spn_new_root"]',
    );
    const childBar = selectedTrace?.querySelector<HTMLElement>(
      '[data-testid="span-waterfall-bar-spn_new_child"]',
    );
    expect(rootBar?.style.left).toBe("0%");
    expect(rootBar?.style.width).toBe("100%");
    expect(rootBar?.style.backgroundColor).toBe("rgb(239, 68, 68)");
    expect(childBar?.style.left).toBe("12.5%");
    expect(childBar?.style.width).toBe("62.5%");
    expect(childBar?.style.minWidth).toBe("3px");
    expect(childBar?.style.backgroundColor).toBe("rgb(59, 130, 246)");

    const initialDetails = selectedTrace?.querySelector<HTMLElement>(
      '[data-testid="span-details"]',
    );
    expect(initialDetails?.textContent).toContain("new root");
    expect(initialDetails?.textContent).toContain("error");
    expect(initialDetails?.textContent).toContain("80");
    expect(initialDetails?.textContent).toContain("ms");
    expect(initialDetails?.textContent).toContain("No attributes.");
    expect(initialDetails?.style.width).toBe("380px");

    const childSpanButton = selectedTrace?.querySelector<HTMLButtonElement>(
      'button[aria-label="Select span new child"]',
    );
    await act(async () => {
      childSpanButton?.click();
      await Promise.resolve();
    });

    const childDetails = selectedTrace?.querySelector(
      '[data-testid="span-details"]',
    );
    expect(childDetails?.textContent).toContain("new child");
    expect(childDetails?.textContent).toContain("spn_new_child");
    expect(childDetails?.textContent).toContain("function.arguments");
    expect(childDetails?.textContent).toContain("shopper");
    expect(childDetails?.textContent).toContain("function.result");
    expect(childDetails?.textContent).toContain("actor_one");

    const orderedChildLogs = childDetails?.querySelectorAll(
      '[data-testid^="span-log-"]',
    );
    expect(orderedChildLogs?.[0]?.textContent).toContain("child earlier");
    expect(orderedChildLogs?.[1]?.textContent).toContain("child later");
    expect(
      childDetails?.querySelector('[data-testid="attached-link-lnk_attached"]'),
    ).not.toBeNull();
    expect(
      selectedTrace?.querySelector('[data-testid="unattached-records"]'),
    ).not.toBeNull();
    expect(
      selectedTrace?.querySelector('[data-testid="unattached-log-lgr_unattached"]'),
    ).not.toBeNull();
    expect(
      selectedTrace?.querySelector('[data-testid="unattached-link-lnk_unattached"]'),
    ).not.toBeNull();
    expect(container.querySelector('[data-testid="unscoped-logs"]')?.textContent).toContain(
      "outside a span",
    );

    const copyButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Copy server trace trc_server_attached"]',
    );
    expect(copyButton).not.toBeNull();
    await act(async () => {
      copyButton?.click();
      await Promise.resolve();
    });
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      "trc_server_attached",
    );

    await act(async () => {
      session.store.setState({
        telemetry: {
          spans: [
            ...initialTelemetry.spans,
            {
              spanId: "spn_new_sibling",
              traceId: "trc_new",
              parentSpanId: "spn_new_root",
              name: "new sibling",
              status: "ok",
              startedAt: 265,
              endedAt: 270,
              attributes: null,
            },
          ],
          logs: initialTelemetry.logs,
          links: initialTelemetry.links,
        },
      });
      await Promise.resolve();
    });
    expect(
      container.querySelector('[data-testid="span-details"]')?.textContent,
    ).toContain("new child");

    const oldTraceButton = container.querySelector<HTMLButtonElement>(
      '[data-testid="trace-list-item-trc_old"]',
    );
    await act(async () => {
      oldTraceButton?.click();
      await Promise.resolve();
    });
    expect(container.querySelector('[data-testid="selected-trace"]')?.textContent).toContain(
      "trc_old",
    );
    expect(router.state.location.search).toBe("?traceId=trc_old");

    await act(async () => {
      session.store.setState({
        telemetry: {
          spans: [
            ...initialTelemetry.spans,
            {
              spanId: "spn_newest_root",
              traceId: "trc_newest",
              parentSpanId: null,
              name: "newest root",
              status: "ok",
              startedAt: 500,
              endedAt: 510,
              attributes: null,
            },
          ],
          logs: initialTelemetry.logs,
          links: initialTelemetry.links,
        },
      });
      await Promise.resolve();
    });

    expect(container.querySelector('[data-testid="selected-trace"]')?.textContent).toContain(
      "trc_old",
    );
    expect(
      container.querySelector('[data-testid^="trace-list-item-"]')?.textContent,
    ).toContain("trc_newest");

    await act(async () => {
      session.store.setState({
        telemetry: {
          spans: [
            {
              spanId: "spn_newest_root",
              traceId: "trc_newest",
              parentSpanId: null,
              name: "newest root",
              status: "ok",
              startedAt: 500,
              endedAt: 510,
              attributes: null,
            },
            {
              spanId: "spn_new_root",
              traceId: "trc_new",
              parentSpanId: null,
              name: "new root",
              status: "error",
              startedAt: 200,
              endedAt: 280,
              attributes: null,
            },
          ],
          logs: [],
          links: [],
        },
      });
      await Promise.resolve();
    });

    await vi.waitFor(() => {
      expect(container.querySelector('[data-testid="selected-trace"]')?.textContent).toContain(
        "trc_newest",
      );
    });
    expect(router.state.location.search).toBe("?traceId=trc_old");
  });

  it("keeps a zero-duration span visible on the one millisecond fallback range", async () => {
    const session = makeSession({
      frontend: main,
      sessionId,
      generateSignature: () => Effect.succeed({ userId: "usr_1" }),
    });
    session.store.setState({
      telemetry: {
        spans: [
          {
            spanId: "spn_instant",
            traceId: "trc_instant",
            parentSpanId: null,
            name: "instant span",
            status: "lost",
            startedAt: 50,
            endedAt: 50,
            attributes: null,
          },
        ],
        logs: [],
        links: [],
      },
    });
    zerospinDevtoolsStore.getState().addSession({
      session,
      pushStagedCommands: () =>
        Promise.resolve({
          pendingCommands: [],
          pushedCommands: [],
          failedCommands: [],
        }),
    });

    const router = createMemoryRouter(
      [
        {
          path: "/:sessionId/logs",
          element: <SessionsLogsRoute />,
        },
      ],
      { initialEntries: [`/${sessionId}/logs`] },
    );

    await act(async () => {
      root.render(<RouterProvider router={router} />);
      await Promise.resolve();
    });

    const waterfall = container.querySelector('[data-testid="span-waterfall"]');
    const instantBar = container.querySelector<HTMLElement>(
      '[data-testid="span-waterfall-bar-spn_instant"]',
    );
    expect(waterfall?.textContent).toContain("1 ms");
    expect(instantBar?.style.left).toBe("0%");
    expect(instantBar?.style.width).toBe("0%");
    expect(instantBar?.style.minWidth).toBe("3px");
    expect(instantBar?.style.backgroundColor).toBe("rgb(245, 158, 11)");
  });

  it("selects the exact trace named by a valid traceId query parameter", async () => {
    const session = makeSession({
      frontend: main,
      sessionId,
      generateSignature: () => Effect.succeed({ userId: "usr_1" }),
    });
    session.store.setState({ telemetry: initialTelemetry });
    zerospinDevtoolsStore.getState().addSession({
      session,
      pushStagedCommands: () =>
        Promise.resolve({
          pendingCommands: [],
          pushedCommands: [],
          failedCommands: [],
        }),
    });

    const router = createMemoryRouter(
      [
        {
          path: "/:sessionId/logs",
          element: <SessionsLogsRoute />,
        },
      ],
      { initialEntries: [`/${sessionId}/logs?traceId=trc_old`] },
    );

    await act(async () => {
      root.render(<RouterProvider router={router} />);
      await Promise.resolve();
    });

    expect(container.querySelector('[data-testid="selected-trace"]')?.textContent).toContain(
      "trc_old",
    );
    expect(
      container
        .querySelector('[data-testid="trace-list-item-trc_old"]')
        ?.getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("selects the newest trace when the traceId query parameter is absent", async () => {
    const session = makeSession({
      frontend: main,
      sessionId,
      generateSignature: () => Effect.succeed({ userId: "usr_1" }),
    });
    session.store.setState({ telemetry: initialTelemetry });
    zerospinDevtoolsStore.getState().addSession({
      session,
      pushStagedCommands: () =>
        Promise.resolve({
          pendingCommands: [],
          pushedCommands: [],
          failedCommands: [],
        }),
    });

    const router = createMemoryRouter(
      [
        {
          path: "/:sessionId/logs",
          element: <SessionsLogsRoute />,
        },
      ],
      { initialEntries: [`/${sessionId}/logs`] },
    );

    await act(async () => {
      root.render(<RouterProvider router={router} />);
      await Promise.resolve();
    });

    expect(container.querySelector('[data-testid="selected-trace"]')?.textContent).toContain(
      "trc_new",
    );
    expect(router.state.location.search).toBe("");
  });

  it("falls back to the newest trace for a stale traceId query parameter", async () => {
    const session = makeSession({
      frontend: main,
      sessionId,
      generateSignature: () => Effect.succeed({ userId: "usr_1" }),
    });
    session.store.setState({ telemetry: initialTelemetry });
    zerospinDevtoolsStore.getState().addSession({
      session,
      pushStagedCommands: () =>
        Promise.resolve({
          pendingCommands: [],
          pushedCommands: [],
          failedCommands: [],
        }),
    });

    const router = createMemoryRouter(
      [
        {
          path: "/:sessionId/logs",
          element: <SessionsLogsRoute />,
        },
      ],
      { initialEntries: [`/${sessionId}/logs?traceId=trc_missing`] },
    );

    await act(async () => {
      root.render(<RouterProvider router={router} />);
      await Promise.resolve();
    });

    expect(container.querySelector('[data-testid="selected-trace"]')?.textContent).toContain(
      "trc_new",
    );
  });

  it("clears only the selected session telemetry, push pointer, and trace query", async () => {
    const session = makeSession({
      frontend: main,
      sessionId,
      generateSignature: () => Effect.succeed({ userId: "usr_1" }),
    });
    session.store.setState({
      telemetry: initialTelemetry,
      lastDevtoolsPush: {
        traceId: "trc_new",
        completedAt: 280,
        status: "ok",
      },
    });
    zerospinDevtoolsStore.getState().addSession({
      session,
      pushStagedCommands: () =>
        Promise.resolve({
          pendingCommands: [],
          pushedCommands: [],
          failedCommands: [],
        }),
    });

    const otherTelemetry: ITelemetryBatch = {
      spans: [
        {
          spanId: "spn_other_root",
          traceId: "trc_other",
          parentSpanId: null,
          name: "other root",
          status: "ok",
          startedAt: 1,
          endedAt: 2,
          attributes: null,
        },
      ],
      logs: [],
      links: [],
    };
    const otherSession = makeSession({
      frontend: main,
      sessionId: otherSessionId,
      generateSignature: () => Effect.succeed({ userId: "usr_1" }),
    });
    otherSession.store.setState({
      telemetry: otherTelemetry,
      lastDevtoolsPush: {
        traceId: "trc_other",
        completedAt: 2,
        status: "ok",
      },
    });
    zerospinDevtoolsStore.getState().addSession({
      session: otherSession,
      pushStagedCommands: () =>
        Promise.resolve({
          pendingCommands: [],
          pushedCommands: [],
          failedCommands: [],
        }),
    });

    const router = createMemoryRouter(
      [
        {
          path: "/:sessionId/logs",
          element: <SessionsLogsRoute />,
        },
      ],
      { initialEntries: [`/${sessionId}/logs?traceId=trc_new`] },
    );

    await act(async () => {
      root.render(<RouterProvider router={router} />);
      await Promise.resolve();
    });

    const clearButton = container.querySelector<HTMLButtonElement>(
      '[data-testid="clear-session-telemetry"]',
    );
    expect(clearButton).not.toBeNull();

    await act(async () => {
      clearButton?.click();
      await Promise.resolve();
    });

    expect(session.store.getState().telemetry).toEqual({
      spans: [],
      logs: [],
      links: [],
    });
    expect(session.store.getState().lastDevtoolsPush).toBeNull();
    expect(otherSession.store.getState().telemetry).toEqual(otherTelemetry);
    expect(otherSession.store.getState().lastDevtoolsPush).toEqual({
      traceId: "trc_other",
      completedAt: 2,
      status: "ok",
    });
    expect(router.state.location.search).toBe("");
    expect(container.textContent).toContain("No scoped traces.");
    expect(container.querySelector('[data-testid="unscoped-logs"]')).toBeNull();
  });
});
