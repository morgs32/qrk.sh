import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { groupsHash } from "../groupsHash";

import { useCatalogDataStore } from "./useCatalogData";

beforeEach(() => {
  useCatalogDataStore.setState({ dataByGroup: {} });
});

describe("content preview data", () => {
  it("starts empty and leaves group defaults untouched", () => {
    expect(useCatalogDataStore.getState().dataByGroup).toEqual({});
    const content = groupsHash.icon.catalogs.default;
    const defaults = content.defaultData;
    useCatalogDataStore.getState().setCatalogData("icon", "default", {
      name: "Star",
      svg: "<svg />",
      providerField: 42,
    });
    expect(content.defaultData).toBe(defaults);
    expect(useCatalogDataStore.getState().dataByGroup.icon.default).toEqual({
      name: "Star",
      svg: "<svg />",
      providerField: 42,
    });
  });

  it("isolates groups and catalogs and replaces rather than merges data", () => {
    const { setCatalogData } = useCatalogDataStore.getState();
    setCatalogData("text", "default", { content: null });
    setCatalogData("github", "repo", null);
    setCatalogData("icon", "default", {
      name: "First",
      svg: "<svg />",
      extra: true,
    });
    setCatalogData("icon", "default", { name: "Second", svg: "<svg />" });
    expect(useCatalogDataStore.getState().dataByGroup).toEqual({
      text: { default: { content: null } },
      github: { repo: null },
      icon: { default: { name: "Second", svg: "<svg />" } },
    });
  });

  it("rejects invalid data before notifying subscribers or changing state", () => {
    const { setCatalogData } = useCatalogDataStore.getState();
    setCatalogData("icon", "default", { name: "Valid", svg: "<svg />" });
    const state = useCatalogDataStore.getState();
    const listener = vi.fn();
    const unsubscribe = useCatalogDataStore.subscribe(listener);
    try {
      expect(() => setCatalogData("icon", "default", { name: 42, svg: "<svg />" })).toThrow();
      expect(() => setCatalogData("icon", "default", null)).toThrow();
      expect(() => setCatalogData("text", "default", {})).toThrow();
      expect(useCatalogDataStore.getState()).toBe(state);
      expect(listener).not.toHaveBeenCalled();
    } finally {
      unsubscribe();
    }
  });

  it("stores Text editor documents and rejects invalid content", () => {
    const { setCatalogData } = useCatalogDataStore.getState();
    const content = { type: "doc", content: [{ type: "paragraph" }] };
    setCatalogData("text", "default", { content });
    const state = useCatalogDataStore.getState();
    expect(state.dataByGroup.text.default).toEqual({ content });
    expect(() => setCatalogData("text", "default", { content: { type: "invalid" } })).toThrow();
    expect(() => setCatalogData("text", "default", null)).toThrow();
    expect(useCatalogDataStore.getState()).toBe(state);
  });

  it("rejects unregistered catalogs without inserting data", () => {
    expect(() => useCatalogDataStore.getState().setCatalogData("missing", "default", {})).toThrow(
      "Catalog not found",
    );
    expect(useCatalogDataStore.getState().dataByGroup).toEqual({});
  });
});
