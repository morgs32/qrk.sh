import { act } from "react";

import { AsyncLive } from "@zerospin/core/async/AsyncLive";
import { makeResourceDbConfig } from "@zerospin/core/drizzle/makeDbConfig";
import { makeMigratedInMemoryWasmSqliteDb } from "@zerospin/core/drizzle/makeMigratedInMemoryWasmSqliteDb";
import { main, mainModels } from "@zerospin/core/fixtures/system";
import { makeSession } from "@zerospin/core/session/makeSession";
import { sessionRepoTables } from "@zerospin/core/session/sessionRepoTables";
import type { ISessionId } from "@zerospin/core/session/types";
import { Effect } from "effect";
import { createRoot, type Root } from "react-dom/client";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SessionToolbar } from "./SessionToolbar";
import { zerospinDevtoolsStore } from "../../../zerospinDevtoolsStore.js";

const sessionId = "sesn_toolbar" as ISessionId;

describe("SessionToolbar", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
      await Promise.resolve();
    });
    zerospinDevtoolsStore.getState().removeSession(sessionId);
    container.remove();
  });

  it("renders push control from session state", async () => {
    const dbConfig = makeResourceDbConfig({
      models: mainModels,
      otherTables: sessionRepoTables,
    });
    const db = await Effect.runPromise(
      makeMigratedInMemoryWasmSqliteDb({ dbConfig }).pipe(
        Effect.provide(AsyncLive),
      ),
    );
    const session = makeSession({
      frontend: main,
      sessionId,
      isPushPaused: true,
      generateSignature: () => Effect.succeed({ userId: "usr_1" }),
    });
    session.store.setState({
      sessionId,
      accountId: "acct_1",
      accountName: main.accountName,
      actorId: "usr_1",
      generationId: "generation_toolbar",
      systemVersion: main.version,
      systemWorkerName: "stub-deploy",
      db,
      schema: dbConfig.schema,
      models: mainModels,
      vfsName: null,
      isInitialized: true,
      frontendIndex: null,
      lastRebasedPushedCursor: null,
    });
    await session.stageCommand({
      contractName: "createList",
      payload: {
        id: "lst_toolbar",
        name: "Toolbar list",
        userId: "usr_1",
      },
    });

    const emptyPushResult = {
      pendingCommands: [],
      pushedCommands: [],
      failedCommands: [],
    };
    let completePush = () => {};
    const pushStagedCommands = vi.fn(() =>
      new Promise<typeof emptyPushResult>((resolve) => {
        completePush = () => {
          resolve(emptyPushResult);
        };
      }),
    );
    zerospinDevtoolsStore.getState().addSession({
      session,
      pushStagedCommands,
    });

    const router = createMemoryRouter(
      [
        {
          path: "/:sessionId",
          element: <SessionToolbar />,
        },
      ],
      { initialEntries: [`/${sessionId}`] },
    );

    await act(async () => {
      root.render(<RouterProvider router={router} />);
      await Promise.resolve();
    });

    const inputs = container.querySelectorAll<HTMLInputElement>(
      'input[type="checkbox"]',
    );

    expect(container.textContent).toContain("Pause push");
    expect(inputs[0]?.checked).toBe(true);
    expect(inputs).toHaveLength(1);

    const pushButton = await vi.waitFor(() => {
      const button = container.querySelector<HTMLButtonElement>("button");
      expect(button?.textContent).toBe("Push");
      expect(button?.disabled).toBe(false);
      return button;
    });

    await act(async () => {
      pushButton?.click();
      await Promise.resolve();
    });

    expect(pushButton?.textContent).toBe("Pushing…");
    expect(pushButton?.disabled).toBe(true);
    expect(pushStagedCommands).toHaveBeenCalledTimes(1);

    await act(async () => {
      completePush();
      await Promise.resolve();
    });

    expect(pushButton?.textContent).toBe("Push");
    expect(pushButton?.disabled).toBe(false);

    await act(async () => {
      session.store.setState({
        lastDevtoolsPush: {
          traceId: "trc_toolbar_success",
          completedAt: 1_757_789_723_456,
          status: "ok",
        },
      });
      await Promise.resolve();
    });

    const successLink = container.querySelector<HTMLAnchorElement>("a");
    expect(successLink?.textContent).toContain("Pushed at ");
    expect(successLink?.title).toBe("2025-09-13T18:55:23.456Z");
    expect(successLink?.getAttribute("href")).toBe(
      "/sessions/sesn_toolbar/logs?traceId=trc_toolbar_success",
    );

    await act(async () => {
      session.store.setState({
        lastDevtoolsPush: {
          traceId: "trc_toolbar_failure",
          completedAt: 1_757_789_723_456,
          status: "error",
        },
      });
      await Promise.resolve();
    });

    expect(successLink?.textContent).toContain("Push failed at ");
    expect(successLink?.getAttribute("href")).toBe(
      "/sessions/sesn_toolbar/logs?traceId=trc_toolbar_failure",
    );
  });
});
