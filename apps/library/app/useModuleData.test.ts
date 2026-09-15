import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { modulesHash } from "../modulesHash";

import { useModuleDataStore } from "./useModuleData";

beforeEach(() => {
  useModuleDataStore.setState({ dataByModule: {} });
});

describe("module preview data", () => {
  it("starts empty and leaves module defaults untouched", () => {
    expect(useModuleDataStore.getState().dataByModule).toEqual({});
    const content = modulesHash.icon;
    const defaults = content.defaultData;
    useModuleDataStore.getState().setModuleData("icon", {
      name: "Star",
      svg: "<svg />",
      providerField: 42,
    });
    expect(content.defaultData).toBe(defaults);
    expect(useModuleDataStore.getState().dataByModule.icon).toEqual({
      name: "Star",
      svg: "<svg />",
      providerField: 42,
    });
  });

  it("isolates modules and replaces rather than merges data", () => {
    const { setModuleData } = useModuleDataStore.getState();
    setModuleData("text", { content: null });
    setModuleData("github-repo", null);
    setModuleData("icon", {
      name: "First",
      svg: "<svg />",
      extra: true,
    });
    setModuleData("icon", { name: "Second", svg: "<svg />" });
    expect(useModuleDataStore.getState().dataByModule).toEqual({
      text: { content: null },
      "github-repo": null,
      icon: { name: "Second", svg: "<svg />" },
    });
  });

  it("rejects invalid data before notifying subscribers or changing state", () => {
    const { setModuleData } = useModuleDataStore.getState();
    setModuleData("icon", { name: "Valid", svg: "<svg />" });
    const state = useModuleDataStore.getState();
    const listener = vi.fn();
    const unsubscribe = useModuleDataStore.subscribe(listener);
    try {
      expect(() => setModuleData("icon", { name: 42, svg: "<svg />" })).toThrow();
      expect(() => setModuleData("icon", null)).toThrow();
      expect(() => setModuleData("text", {})).toThrow();
      expect(useModuleDataStore.getState()).toBe(state);
      expect(listener).not.toHaveBeenCalled();
    } finally {
      unsubscribe();
    }
  });

  it("stores Text editor documents and rejects invalid content", () => {
    const { setModuleData } = useModuleDataStore.getState();
    const content = { type: "doc", content: [{ type: "paragraph" }] };
    setModuleData("text", { content });
    const state = useModuleDataStore.getState();
    expect(state.dataByModule.text).toEqual({ content });
    expect(() => setModuleData("text", { content: { type: "invalid" } })).toThrow();
    expect(() => setModuleData("text", null)).toThrow();
    expect(useModuleDataStore.getState()).toBe(state);
  });

  it("rejects unregistered modules without inserting data", () => {
    expect(() => useModuleDataStore.getState().setModuleData("missing", {})).toThrow(
      "Module not found",
    );
    expect(useModuleDataStore.getState().dataByModule).toEqual({});
  });
});
