import { afterAll, expect, it, vi } from "vitest";

const savedItems = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (key: string) => savedItems.get(key) ?? null,
  setItem: (key: string, value: string) => savedItems.set(key, value),
  removeItem: (key: string) => savedItems.delete(key)});
vi.stubGlobal("window", { localStorage });
const { useGridStore } = await import("./useGridStore");
afterAll(() => vi.unstubAllGlobals());

for (const [oldWidth, newWidth] of [
  [768, 640],
  [1536, 1440],
]) {
  it(`removes obsolete overrides and maps the ${oldWidth}px preset and resets old brick drafts`, async () => {
    const key = "qrk-bricks-sandbox-responsive-bricks-v3";
    const entry = {
      gridItem: { i: "kept", x: 0, y: 0, w: 4, h: 4 },
      appearanceOptions: { imagePosition: "left" }};
    const brick = {
      registryId: "thumbnail",
      viewId: "4x4",
      data: { title: "Keep content" },
      xs: entry,
      sm: { ...entry, gridItem: null },
      lg: entry,
      xl: entry};
    savedItems.set(
      key,
      JSON.stringify({
        version: 1,
        state: {
          selectedWidth: oldWidth,
          bricksById: {
            kept: {
              ...brick,
              xs: { ...brick.xs, frame: "card" },
              sm: { ...brick.sm, frame: "default" },
              lg: { ...brick.lg, frame: "card" },
              xl: { ...brick.xl, frame: "card" },
              md: entry,
              "2xl": entry}}}}),
    );
    await useGridStore.persist.rehydrate();
    expect(useGridStore.getState().bricksById).toEqual({});
    expect(useGridStore.getState().selectedWidth).toBe(newWidth);
    const saved = JSON.parse(savedItems.get(key)!);
    expect(saved.state.bricksById).toEqual({});
    expect(saved.version).toBe(3);
    expect(saved.state.selectedWidth).toBe(newWidth);
  });
}
