import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { collectionsHash } from "../collectionsHash";
import { useVariantDataStore } from "./useVariantData";

beforeEach(() => {
  useVariantDataStore.setState({ dataByCollection: {} });
});

describe("variant preview data", () => {
  it("starts empty and leaves catalog defaults untouched", () => {
    expect(useVariantDataStore.getState().dataByCollection).toEqual({});
    const variant = collectionsHash.icon.variants.default;
    const defaults = variant.defaultData;
    useVariantDataStore.getState().setVariantData("icon", "default", {
      name: "Star",
      svg: "<svg />",
      providerField: 42,
    });
    expect(variant.defaultData).toBe(defaults);
    expect(useVariantDataStore.getState().dataByCollection.icon.default).toEqual({
      name: "Star",
      svg: "<svg />",
      providerField: 42,
    });
  });

  it("isolates collections and variants and replaces rather than merges data", () => {
    const { setVariantData } = useVariantDataStore.getState();
    setVariantData("text", "default", { content: null });
    setVariantData("github", "repo", null);
    setVariantData("icon", "default", { name: "First", svg: "<svg />", extra: true });
    setVariantData("icon", "default", { name: "Second", svg: "<svg />" });
    expect(useVariantDataStore.getState().dataByCollection).toEqual({
      text: { default: { content: null } },
      github: { repo: null },
      icon: { default: { name: "Second", svg: "<svg />" } },
    });
  });

  it("rejects invalid data before notifying subscribers or changing state", () => {
    const { setVariantData } = useVariantDataStore.getState();
    setVariantData("icon", "default", { name: "Valid", svg: "<svg />" });
    const state = useVariantDataStore.getState();
    const listener = vi.fn();
    const unsubscribe = useVariantDataStore.subscribe(listener);
    try {
      expect(() => setVariantData("icon", "default", { name: 42, svg: "<svg />" })).toThrow();
      expect(() => setVariantData("icon", "default", null)).toThrow();
      expect(() => setVariantData("text", "default", {})).toThrow();
      expect(useVariantDataStore.getState()).toBe(state);
      expect(listener).not.toHaveBeenCalled();
    } finally {
      unsubscribe();
    }
  });

  it("stores Text editor documents and rejects invalid content", () => {
    const { setVariantData } = useVariantDataStore.getState();
    const content = { type: "doc", content: [{ type: "paragraph" }] };
    setVariantData("text", "default", { content });
    const state = useVariantDataStore.getState();
    expect(state.dataByCollection.text.default).toEqual({ content });
    expect(() => setVariantData("text", "default", { content: { type: "invalid" } })).toThrow();
    expect(() => setVariantData("text", "default", null)).toThrow();
    expect(useVariantDataStore.getState()).toBe(state);
  });

  it("rejects unregistered variants without inserting data", () => {
    expect(() => useVariantDataStore.getState().setVariantData("missing", "default", {})).toThrow(
      "Variant not found",
    );
    expect(useVariantDataStore.getState().dataByCollection).toEqual({});
  });
});
