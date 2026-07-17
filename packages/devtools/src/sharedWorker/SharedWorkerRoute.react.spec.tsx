import { act } from "react";

import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { zerospinDevtoolsStore } from "../zerospinDevtoolsStore.js";
import { SharedWorkerRoute } from "./SharedWorkerRoute.js";

describe("SharedWorkerRoute", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    zerospinDevtoolsStore.getState().setSharedWorkerUserApi(null);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
      await Promise.resolve();
    });
    zerospinDevtoolsStore.getState().setSharedWorkerUserApi(null);
    container.remove();
  });

  it("renders disabled and enabled connection state", async () => {
    await act(async () => {
      root.render(<SharedWorkerRoute />);
      await Promise.resolve();
    });

    expect(container.textContent).toBe("Shared Worker is disabled");

    await act(async () => {
      zerospinDevtoolsStore.getState().setSharedWorkerUserApi({
        listFrontendReplicas: async () => [],
      });
      await Promise.resolve();
    });

    expect(container.textContent).toBe("Shared Worker is enabled");
  });
});
