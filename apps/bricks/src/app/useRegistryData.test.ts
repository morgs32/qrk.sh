import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { catalogsHash } from "../catalogsHash";

import { useRegistryDataStore } from "./useRegistryData";

beforeEach(() => {
  useRegistryDataStore.setState({ dataByCatalog: {} });
});

describe("content preview data", () => {
  it("starts empty and leaves catalog defaults untouched", () => {
    expect(useRegistryDataStore.getState().dataByCatalog).toEqual({});
    const content = catalogsHash.icon.registries.default;
    const defaults = content.defaultData;
    useRegistryDataStore.getState().setRegistryData("icon", "default", {
      name: "Star",
      svg: "<svg />",
      providerField: 42,
    });
    expect(content.defaultData).toBe(defaults);
    expect(useRegistryDataStore.getState().dataByCatalog.icon.default).toEqual({
      name: "Star",
      svg: "<svg />",
      providerField: 42,
    });
  });

  it("isolates catalogs and registries and replaces rather than merges data", () => {
    const { setRegistryData } = useRegistryDataStore.getState();
    setRegistryData("text", "default", { content: null });
    setRegistryData("github", "repo", null);
    setRegistryData("icon", "default", {
      name: "First",
      svg: "<svg />",
      extra: true,
    });
    setRegistryData("icon", "default", { name: "Second", svg: "<svg />" });
    expect(useRegistryDataStore.getState().dataByCatalog).toEqual({
      text: { default: { content: null } },
      github: { repo: null },
      icon: { default: { name: "Second", svg: "<svg />" } },
    });
  });

  it("rejects invalid data before notifying subscribers or changing state", () => {
    const { setRegistryData } = useRegistryDataStore.getState();
    setRegistryData("icon", "default", { name: "Valid", svg: "<svg />" });
    const state = useRegistryDataStore.getState();
    const listener = vi.fn();
    const unsubscribe = useRegistryDataStore.subscribe(listener);
    try {
      expect(() => setRegistryData("icon", "default", { name: 42, svg: "<svg />" })).toThrow();
      expect(() => setRegistryData("icon", "default", null)).toThrow();
      expect(() => setRegistryData("text", "default", {})).toThrow();
      expect(useRegistryDataStore.getState()).toBe(state);
      expect(listener).not.toHaveBeenCalled();
    } finally {
      unsubscribe();
    }
  });

  it("stores Text editor documents and rejects invalid content", () => {
    const { setRegistryData } = useRegistryDataStore.getState();
    const content = { type: "doc", content: [{ type: "paragraph" }] };
    setRegistryData("text", "default", { content });
    const state = useRegistryDataStore.getState();
    expect(state.dataByCatalog.text.default).toEqual({ content });
    expect(() => setRegistryData("text", "default", { content: { type: "invalid" } })).toThrow();
    expect(() => setRegistryData("text", "default", null)).toThrow();
    expect(useRegistryDataStore.getState()).toBe(state);
  });

  it("rejects unregistered registries without inserting data", () => {
    expect(() => useRegistryDataStore.getState().setRegistryData("missing", "default", {})).toThrow(
      "Registry not found",
    );
    expect(useRegistryDataStore.getState().dataByCatalog).toEqual({});
  });
});
