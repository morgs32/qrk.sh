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
import {
  createMemoryRouter,
  createRoutesFromElements,
  Route,
  RouterProvider,
} from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SessionsCommandsLayout } from "./SessionsCommandsLayout";
import { SessionsCommandsStagedRoute } from "./staged/SessionsCommandsStagedRoute";
import { zerospinDevtoolsStore } from "../../../../zerospinDevtoolsStore.js";

const sessionId = "sesn_commands_layout" as ISessionId;

describe("SessionsCommandsLayout", () => {
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
    vi.clearAllMocks();
  });

  it("renders staged commands from session otherTables query relations", async () => {
    const models = mainModels;
    const dbConfig = makeResourceDbConfig({
      models,
      otherTables: sessionRepoTables,
    });
    const schema = dbConfig.schema;
    const db = await Effect.runPromise(
      makeMigratedInMemoryWasmSqliteDb({ dbConfig }).pipe(
        Effect.provide(AsyncLive),
      ),
    );

    expect(typeof db.query.stagedCommands!.findMany).toBe("function");

    const session = makeSession({
      frontend: main,
      sessionId,
      generateSignature: () => Effect.succeed({ userId: "usr_1" }),
    });

    session.store.setState({
      sessionId,
      accountId: "acct_1",
      accountName: main.accountName,
      actorId: "usr_1",
      systemWorkerName: "stub-deploy",
      db,
      schema,
      models,
      vfsName: null,
      isInitialized: true,
      frontendIndex: null,
      lastRebasedPushedCursor: null,
      isPushPaused: false,
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
      createRoutesFromElements(
        <Route path="/:sessionId/commands" element={<SessionsCommandsLayout />}>
          <Route path="staged" element={<SessionsCommandsStagedRoute />} />
        </Route>,
      ),
      { initialEntries: [`/${sessionId}/commands/staged`] },
    );

    await act(async () => {
      root.render(<RouterProvider router={router} />);
      await Promise.resolve();
    });

    await vi.waitFor(() => {
      expect(container.textContent).toContain("No rows.");
    });
  });
});
