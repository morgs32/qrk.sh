import { beforeEach, describe, expect, it } from "vitest";
import { collectionsHash } from "../collectionsHash";
import { useGridStore } from "./useGridStore";
import { resolveBrickBreakpoint } from "./resolveBrickBreakpoint";

beforeEach(() => useGridStore.setState({ bricksById: {} }));

describe("responsive placed bricks", () => {
  const def = collectionsHash.figma.contents.thumbnail.views["4x4"].def;
  const first = { i: "first", x: 0, y: 0, w: 4, h: 4 };
  const second = { i: "second", x: 4, y: 0, w: 4, h: 4 };
  it("copies drops and options independently while sharing each brick's content", () => {
    const store = useGridStore.getState();
    const options = { imagePosition: "left" };
    store.addBrick("first", { ...def, viewOptions: options }, [first], "lg");
    store.addBrick("second", { ...def, viewOptions: options }, [first, second], "xs");
    options.imagePosition = "right";
    store.setViewOptions("first", "xl", { imagePosition: "top" });
    const bricks = useGridStore.getState().bricksById;
    expect(bricks.first.xs.viewOptions).toEqual({ imagePosition: "left" });
    expect(bricks.first.lg).toEqual(bricks.first.xs);
    expect(bricks.first.lg).not.toBe(bricks.first.xs);
    expect(bricks.first.lg?.viewOptions).not.toBe(bricks.first.xs.viewOptions);
    expect(bricks.first.xl?.gridItem).not.toBe(bricks.first.lg?.gridItem);
    expect(bricks.second.xs.viewOptions).toEqual({ imagePosition: "left" });
    expect(bricks.first.xl).not.toHaveProperty("data");
    expect(bricks.first.data).toEqual(def.data);
    expect(bricks.first.data).not.toBe(bricks.second.data);
    expect(() => store.setViewOptions("first", "sm", { imagePosition: "invalid" })).toThrow();
    expect(useGridStore.getState().bricksById).toBe(bricks);
  });
  it("writes moves, resize and rearrangements only to the edited breakpoint", () => {
    const store = useGridStore.getState();
    store.addBrick("first", def, [first], "xs");
    store.addBrick("second", def, [first, second], "xs");
    store.setLayout(
      [
        { ...first, w: 6 },
        { ...second, x: 0, y: 4 },
      ],
      "lg",
    );
    const bricks = useGridStore.getState().bricksById;
    expect(bricks.first.xs.gridItem).toEqual(first);
    expect(bricks.second.xs.gridItem).toEqual(second);
    expect(bricks.first.lg?.gridItem?.w).toBe(6);
    expect(bricks.second.lg?.gridItem?.y).toBe(4);
    expect(resolveBrickBreakpoint(bricks.first, "xl")).toBe(bricks.first.lg);
  });
  it("hides, edits hidden options and restores nearest smaller visible placement", () => {
    const store = useGridStore.getState();
    store.addBrick("first", def, [first], "xs");
    store.setVisible("first", "sm", false);
    store.setViewOptions("first", "lg", { imagePosition: "bottom" });
    expect(
      resolveBrickBreakpoint(useGridStore.getState().bricksById.first, "xl").gridItem,
    ).toBeNull();
    store.setVisible("first", "xl", true);
    const brick = useGridStore.getState().bricksById.first;
    expect(brick.xl?.gridItem).toEqual(first);
    expect(brick.xl?.viewOptions).toEqual({ imagePosition: "bottom" });
    expect(brick.sm?.gridItem).toBeNull();
    store.setVisible("first", "xs", false);
    store.setVisible("first", "xs", true);
    expect(useGridStore.getState().bricksById.first.xs.gridItem).toEqual(first);
  });
  it("defaults frames and overrides complete inherited entries independently", () => {
    const store = useGridStore.getState();
    store.addBrick("first", def, [first], "xs");
    store.addBrick("second", def, [first, second], "lg");
    expect(useGridStore.getState().bricksById.first.xs.frame).toBe("default");
    expect(useGridStore.getState().bricksById.second.lg?.frame).toBe("default");
    store.setFrame("first", "sm", "card");
    let brick = useGridStore.getState().bricksById.first;
    expect(brick.xs.frame).toBe("default");
    expect(brick.sm?.gridItem).toEqual(first);
    expect(brick.sm?.gridItem).not.toBe(brick.xs.gridItem);
    expect(brick.sm?.viewOptions).toEqual(brick.xs.viewOptions);
    expect(resolveBrickBreakpoint(brick, "lg").frame).toBe("card");
    expect(resolveBrickBreakpoint(brick, "xl").frame).toBe("card");
    store.setFrame("first", "lg", "default");
    brick = useGridStore.getState().bricksById.first;
    expect(resolveBrickBreakpoint(brick, "xl").frame).toBe("default");
    const inherited = { ...brick };
    delete inherited.lg;
    useGridStore.setState({
      bricksById: { ...useGridStore.getState().bricksById, first: inherited },
    });
    expect(resolveBrickBreakpoint(useGridStore.getState().bricksById.first, "lg").frame).toBe(
      "card",
    );
    expect(useGridStore.getState().bricksById.second.xs.frame).toBe("default");
  });
  it("preserves frames through options, layout, and hidden edits", () => {
    const store = useGridStore.getState();
    store.addBrick("first", def, [first], "xs");
    store.setFrame("first", "xs", "card");
    store.setViewOptions("first", "sm", { imagePosition: "right" });
    store.setLayout([{ ...first, x: 1 }], "lg");
    store.setVisible("first", "xl", false);
    let brick = useGridStore.getState().bricksById.first;
    expect(brick.sm?.frame).toBe("card");
    expect(brick.lg?.frame).toBe("card");
    expect(brick.xl?.frame).toBe("card");
    store.setFrame("first", "xl", "default");
    expect(useGridStore.getState().bricksById.first.xl?.gridItem).toBeNull();
    store.setVisible("first", "xl", true);
    brick = useGridStore.getState().bricksById.first;
    expect(brick.xl?.frame).toBe("default");
    expect(brick.xl?.gridItem).toEqual({ ...first, x: 1 });
    expect(brick.xl?.viewOptions).toEqual({ imagePosition: "right" });
  });
});

it("keeps lg and xl overrides independent and restores inheritance after removal", () => {
  const store = useGridStore.getState();
  const def = collectionsHash.figma.contents.thumbnail.views["4x4"].def;
  const placement = { i: "large", x: 0, y: 0, w: 4, h: 4 };
  store.addBrick("large", def, [placement], "sm");
  store.setViewOptions("large", "lg", { imagePosition: "left" });
  store.setFrame("large", "lg", "card");
  store.setLayout([{ ...placement, x: 4 }], "lg");
  store.setVisible("large", "lg", false);
  expect(resolveBrickBreakpoint(useGridStore.getState().bricksById.large, "xl").gridItem).toBeNull();
  store.setVisible("large", "xl", true);
  store.setViewOptions("large", "xl", { imagePosition: "right" });
  let brick = useGridStore.getState().bricksById.large;
  expect(brick["xl"]?.gridItem).toEqual(placement);
  expect(brick["xl"]?.frame).toBe("card");
  expect(brick.lg?.gridItem).toBeNull();
  expect(brick.lg?.viewOptions).toEqual({ imagePosition: "left" });
  expect(brick["xl"]?.viewOptions).toEqual({ imagePosition: "right" });
  const inherited = { ...brick };
  delete inherited["xl"];
  useGridStore.setState({ bricksById: { large: inherited } });
  brick = useGridStore.getState().bricksById.large;
  expect(resolveBrickBreakpoint(brick, "xl")).toBe(brick.lg);
  store.setVisible("large", "lg", true);
  expect(useGridStore.getState().bricksById.large.lg?.gridItem).toEqual(placement);
});
