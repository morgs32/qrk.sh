import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { catalogsHash } from "../catalogsHash";
import { useContentDataStore } from "./useContentData";

beforeEach(() => {
  useContentDataStore.setState({ dataByCatalog: {} });
});

describe("content preview data", () => {
  it("starts empty and leaves catalog defaults untouched", () => {
    expect(useContentDataStore.getState().dataByCatalog).toEqual({});
    const content = catalogsHash.icon.contents.default;
    const defaults = content.defaultData;
    useContentDataStore.getState().setContentData("icon", "default", {
      name: "Star",
      svg: "<svg />",
      providerField: 42,
    });
    expect(content.defaultData).toBe(defaults);
    expect(useContentDataStore.getState().dataByCatalog.icon.default).toEqual({
      name: "Star",
      svg: "<svg />",
      providerField: 42,
    });
  });

  it("isolates catalogs and contents and replaces rather than merges data", () => {
    const { setContentData } = useContentDataStore.getState();
    setContentData("text", "default", { content: null });
    setContentData("github", "repo", null);
    setContentData("icon", "default", { name: "First", svg: "<svg />", extra: true });
    setContentData("icon", "default", { name: "Second", svg: "<svg />" });
    expect(useContentDataStore.getState().dataByCatalog).toEqual({
      text: { default: { content: null } },
      github: { repo: null },
      icon: { default: { name: "Second", svg: "<svg />" } },
    });
  });

  it("rejects invalid data before notifying subscribers or changing state", () => {
    const { setContentData } = useContentDataStore.getState();
    setContentData("icon", "default", { name: "Valid", svg: "<svg />" });
    const state = useContentDataStore.getState();
    const listener = vi.fn();
    const unsubscribe = useContentDataStore.subscribe(listener);
    try {
      expect(() => setContentData("icon", "default", { name: 42, svg: "<svg />" })).toThrow();
      expect(() => setContentData("icon", "default", null)).toThrow();
      expect(() => setContentData("text", "default", {})).toThrow();
      expect(useContentDataStore.getState()).toBe(state);
      expect(listener).not.toHaveBeenCalled();
    } finally {
      unsubscribe();
    }
  });

  it("stores Text editor documents and rejects invalid content", () => {
    const { setContentData } = useContentDataStore.getState();
    const content = { type: "doc", content: [{ type: "paragraph" }] };
    setContentData("text", "default", { content });
    const state = useContentDataStore.getState();
    expect(state.dataByCatalog.text.default).toEqual({ content });
    expect(() => setContentData("text", "default", { content: { type: "invalid" } })).toThrow();
    expect(() => setContentData("text", "default", null)).toThrow();
    expect(useContentDataStore.getState()).toBe(state);
  });

  it("rejects unregistered contents without inserting data", () => {
    expect(() => useContentDataStore.getState().setContentData("missing", "default", {})).toThrow(
      "Content not found",
    );
    expect(useContentDataStore.getState().dataByCatalog).toEqual({});
  });
});
