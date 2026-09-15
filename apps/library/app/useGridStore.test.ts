import { beforeEach, describe, expect, it } from "vitest";

import { modulesHash } from "../modulesHash";

import { resolveBrickBreakpoint } from "./resolveBrickBreakpoint";
import { useGridStore } from "./useGridStore";

beforeEach(() => useGridStore.setState({ bricksById: {} }));

describe("responsive placed bricks", () => {
  it("keeps saved repo sizes authoritative when defaults differ across breakpoints", () => {
    const def = modulesHash['github-repo'].def;
    const store = useGridStore.getState();
    const placement = { i: "repo", x: 0, y: 0, ...def.xs };
    store.addBrick("repo", def, [placement], "xs");
    expect(resolveBrickBreakpoint(useGridStore.getState().bricksById.repo, "sm").gridItem).toEqual(
      placement,
    );
    store.setLayout([{ ...placement, w: 3, h: 5 }], "sm");
    const brick = useGridStore.getState().bricksById.repo;
    expect(brick.xs.gridItem).toEqual(placement);
    expect(resolveBrickBreakpoint(brick, "xl").gridItem).toEqual({ ...placement, w: 3, h: 5 });
  });

  it("uses the current catalog dimensions when showing a repo without a saved visible placement", () => {
    for (const breakpoint of ["xs", "sm", "lg", "xl"] satisfies Array<"xs" | "sm" | "lg" | "xl">) {
      const def = modulesHash['github-repo'].def;
      useGridStore.setState({
        bricksById: {
          repo: {
            moduleId: "github-repo",
            data: null,
            xs: { gridItem: null, appearanceOptions: {} },
          },
        },
      });
      useGridStore.getState().setVisible("repo", breakpoint, true);
      expect(
        resolveBrickBreakpoint(useGridStore.getState().bricksById.repo, breakpoint).gridItem,
      ).toEqual({ i: "repo", x: 0, y: 0, ...def[breakpoint] });
    }
  });
  const def = modulesHash['figma-thumbnail'].def;
  const first = { i: "first", x: 0, y: 0, w: 4, h: 4 };
  const second = { i: "second", x: 4, y: 0, w: 4, h: 4 };
  it("copies drops and options independently while sharing each brick's content", () => {
    const store = useGridStore.getState();
    const options = { imagePosition: "left" };
    store.addBrick("first", { ...def, appearanceOptions: options }, [first], "lg");
    store.addBrick("second", { ...def, appearanceOptions: options }, [first, second], "xs");
    options.imagePosition = "right";
    store.setAppearanceOptions("first", "xl", { imagePosition: "top" });
    const bricks = useGridStore.getState().bricksById;
    expect(bricks.first.xs.appearanceOptions).toEqual({
      imagePosition: "left",
    });
    expect(bricks.first.lg).toEqual(bricks.first.xs);
    expect(bricks.first.lg).not.toBe(bricks.first.xs);
    expect(bricks.first.lg?.appearanceOptions).not.toBe(bricks.first.xs.appearanceOptions);
    expect(bricks.first.xl?.gridItem).not.toBe(bricks.first.lg?.gridItem);
    expect(bricks.second.xs.appearanceOptions).toEqual({
      imagePosition: "left",
    });
    expect(bricks.first.xl).not.toHaveProperty("data");
    expect(bricks.first.data).toEqual(def.data);
    expect(bricks.first.data).not.toBe(bricks.second.data);
    expect(() => store.setAppearanceOptions("first", "sm", { imagePosition: "invalid" })).toThrow();
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
    store.setAppearanceOptions("first", "lg", { imagePosition: "bottom" });
    expect(
      resolveBrickBreakpoint(useGridStore.getState().bricksById.first, "xl").gridItem,
    ).toBeNull();
    store.setVisible("first", "xl", true);
    const brick = useGridStore.getState().bricksById.first;
    expect(brick.xl?.gridItem).toEqual(first);
    expect(brick.xl?.appearanceOptions).toEqual({ imagePosition: "bottom" });
    expect(brick.sm?.gridItem).toBeNull();
    store.setVisible("first", "xs", false);
    store.setVisible("first", "xs", true);
    expect(useGridStore.getState().bricksById.first.xs.gridItem).toEqual(first);
  });
});

it("keeps lg and xl overrides independent and restores inheritance after removal", () => {
  const store = useGridStore.getState();
  const def = modulesHash['figma-thumbnail'].def;
  const placement = { i: "large", x: 0, y: 0, w: 4, h: 4 };
  store.addBrick("large", def, [placement], "sm");
  store.setAppearanceOptions("large", "lg", { imagePosition: "left" });
  store.setLayout([{ ...placement, x: 4 }], "lg");
  store.setVisible("large", "lg", false);
  expect(
    resolveBrickBreakpoint(useGridStore.getState().bricksById.large, "xl").gridItem,
  ).toBeNull();
  store.setVisible("large", "xl", true);
  store.setAppearanceOptions("large", "xl", { imagePosition: "right" });
  let brick = useGridStore.getState().bricksById.large;
  expect(brick["xl"]?.gridItem).toEqual(placement);
  expect(brick.lg?.gridItem).toBeNull();
  expect(brick.lg?.appearanceOptions).toEqual({ imagePosition: "left" });
  expect(brick["xl"]?.appearanceOptions).toEqual({ imagePosition: "right" });
  const inherited = { ...brick };
  delete inherited["xl"];
  useGridStore.setState({ bricksById: { large: inherited } });
  brick = useGridStore.getState().bricksById.large;
  expect(resolveBrickBreakpoint(brick, "xl")).toBe(brick.lg);
  store.setVisible("large", "lg", true);
  expect(useGridStore.getState().bricksById.large.lg?.gridItem).toEqual(placement);
});
