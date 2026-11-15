import { behanceView } from "@qrk.sh/bricks/modules/behance/view";
import { buyMeACoffeeView } from "@qrk.sh/bricks/modules/buyMeACoffee/view";
import { linkV1 } from "@qrk.sh/bricks/modules/link/definition";
import { linkPreviewState } from "@qrk.sh/bricks/modules/link/definition/linkPreviewState";
import { LinkLineIcon } from "@qrk.sh/bricks/modules/link/LinkLineIcon";
import { LinkPlaceholder } from "@qrk.sh/bricks/modules/link/LinkPlaceholder";
import { linkReactRegistry } from "@qrk.sh/bricks/modules/link/react";
import { addBrick, updateBrick } from "@qrk.sh/bricks/modules/link/commands/brickActions";
import { makeModuleView } from "@qrk.sh/bricks/modules/react/makeModuleView";
import type { pageSnapshotSchema } from "@qrk.sh/bricks/zerospin/models/pageSnapshot/pageSnapshotSchema";
import { resolveBrickLayout } from "@qrk.sh/bricks/modules/freshLibrary";
import { swatchAndIconPreviewState } from "@qrk.sh/bricks/modules/swatchAndIcon/definition/swatchAndIconPreviewState";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect } from "storybook/test";
import { WallViewer } from "./WallViewer";

const linkView = makeModuleView(linkV1, {
  categoryIds: ["business", "tools"],
  defaultState: linkPreviewState,
  defaultPlacementState: {},
  add: addBrick,
  update: updateBrick,
  LineIcon: LinkLineIcon,
  variants: {
    default: {
      placeholder: LinkPlaceholder,
      registry: linkReactRegistry,
    },
  },
});

const snapshot = {
  rowSizing: "preferred",
  slug: "index",
  title: "Field notes",
  description: null,
  bricks: [
    {
      id: "brk_green",
      moduleId: "swatch-and-icon",
      brickState: swatchAndIconPreviewState,
      borderWidth: 0,
    },
    {
      id: "brk_gold",
      moduleId: "swatch-and-icon",
      brickState: { ...swatchAndIconPreviewState, payload: { hash: "", color: "#d6ad60" } },
      borderWidth: 0,
    },
    {
      id: "brk_field_notes",
      moduleId: "article",
      brickState: { title: "Field notes", subtitle: "", content: "A weekend away from the city." },
      borderWidth: 1,
    },
    {
      id: "brk_link",
      moduleId: "link",
      brickState: linkPreviewState,
      borderWidth: 1,
    },
  ],
  walls: [
    {
      id: "wal_lg",
      breakpoint: "lg",
      sections: [
        {
          id: "sec_swatches",
          stacks: [
            {
              id: "stk_swatches",
              name: "Swatches",
              rows: [
                {
                  id: "row_swatches",
                  minHeight: 96,
                  preferredWidth: 380,
                  alignment: "right",
                  placements: [
                    {
                      id: "plc_gold",
                      brickId: "brk_gold",
                      widthWeight: 240,
                      layoutId: "default",
                      placementState: {},
                      spec: resolveBrickLayout({ moduleId: "swatch-and-icon", layoutId: "default", brickState: swatchAndIconPreviewState }),
                    },
                    {
                      id: "plc_green",
                      brickId: "brk_green",
                      widthWeight: 180,
                      layoutId: "default",
                      placementState: {},
                      spec: resolveBrickLayout({ moduleId: "swatch-and-icon", layoutId: "default", brickState: swatchAndIconPreviewState }),
                    },
                  ],
                },
              ],
            },
            { id: "stk_empty", name: "Empty", rows: [] },
          ],
        },
        {
          id: "sec_article",
          stacks: [
            {
              id: "stk_article",
              name: "Article",
              rows: [
                {
                  id: "row_article",
                  minHeight: null,
                  preferredWidth: 520,
                  alignment: "center",
                  placements: [
                    {
                      id: "plc_field_notes",
                      brickId: "brk_field_notes",
                      widthWeight: 720,
                      layoutId: "default",
                      placementState: {},
                      spec: resolveBrickLayout({ moduleId: "article", layoutId: "default", brickState: { title: "Field notes", subtitle: "", content: "A weekend away from the city." } }),
                    },
                  ],
                },
                {
                  id: "row_link",
                  minHeight: null,
                  preferredWidth: 520,
                  alignment: "center",
                  placements: [
                    {
                      id: "plc_link",
                      brickId: "brk_link",
                      widthWeight: 480,
                      layoutId: "default",
                      placementState: {},
                      spec: {
                        root: "card",
                        elements: {
                          card: { type: "LinkCard", props: {}, children: ["copy", "hero"] },
                          copy: {
                            type: "LinkCopy",
                            props: {
                              url: { $state: "/brickState/data/url" },
                              title: "A link saved on this Wall",
                              siteName: { $state: "/brickState/data/siteName" },
                              iconUrl: { $state: "/brickState/data/iconUrl" },
                            },
                          },
                          hero: {
                            type: "LinkHeroImage",
                            props: { imageUrl: { $state: "/brickState/data/imageUrl" } },
                          },
                        },
                      },
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
} satisfies typeof pageSnapshotSchema.Type;

const meta = {
  title: "Web/WallViewer",
  component: WallViewer,
  parameters: { layout: "padded" },
  args: {
    snapshot,
    breakpoint: "lg",
    brickGap: 16,
    renderBrick: (brick, placement) => {
      const { brickState: state } = brick;
      if (brick.moduleId === "link") {
        return (
          <linkView.Render brickState={state} placementState={placement.placementState} layoutId={placement.layoutId} spec={placement.spec} />
        );
      }
      if (typeof state !== "object" || state === null)
        throw new Error("Missing fixture Brick state");
      if ("title" in state && "content" in state) {
        return (
          <article data-spec-root={placement.spec.root} style={{ padding: 24 }}>
            <h1>{String(state.title)}</h1>
            <p>{String(state.content)}</p>
          </article>
        );
      }
      if (
        "payload" in state &&
        typeof state.payload === "object" &&
        state.payload !== null &&
        "color" in state.payload
      ) {
        return (
          <div
            data-spec-root={placement.spec.root}
            style={{ backgroundColor: String(state.payload.color) }}
          />
        );
      }
      throw new Error(`Unsupported fixture Brick ${brick.id}`);
    },
  },
} satisfies Meta<typeof WallViewer>;

export default meta;
export const PublishedSnapshot = {
  play: async ({ canvasElement }) => {
    const articleRow = canvasElement.querySelector('[data-wall-row-id="row_article"]');
    await expect(articleRow).toHaveStyle({ width: "720px" });
    const linkRow = canvasElement.querySelector('[data-wall-row-id="row_link"]');
    await expect(linkRow).toHaveStyle({ width: "480px" });
  },
} satisfies StoryObj<typeof meta>;

export const WeightedStacks = {
  args: {
    snapshot: {
      ...snapshot,
      walls: snapshot.walls.map((wall) => ({
        ...wall,
        sections: wall.sections.map((section) => ({
          ...section,
          stacks: section.stacks.map((stack) => ({
            ...stack,
            widthWeight: stack.id === "stk_swatches" ? 2 : 1,
          })),
        })),
      })),
    },
  },
  play: async ({ canvasElement }) => {
    const first = canvasElement.querySelector('[data-wall-stack-id="stk_swatches"]');
    const second = canvasElement.querySelector('[data-wall-stack-id="stk_empty"]');
    await expect(first).not.toBeNull();
    await expect(second).not.toBeNull();
    if (first === null || second === null) throw new Error("Missing Stack fixture");
    await expect(first.getBoundingClientRect().width).toBeCloseTo(1096 * 2 / 3 - 16, 1);
    await expect(second.getBoundingClientRect().width).toBeCloseTo(1096 / 3 - 16, 1);
  },
} satisfies StoryObj<typeof meta>;


export const PortfolioSnapshot = {
  args: {
    snapshot: {
      ...snapshot,
      title: "Portfolio",
      bricks: [
        { id: "brk_behance", moduleId: "behance", brickState: behanceView.def.state, borderWidth: 0 },
        { id: "brk_coffee", moduleId: "buy-me-a-coffee", brickState: buyMeACoffeeView.def.state, borderWidth: 0 },
      ],
      walls: [{
        id: "wal_lg",
        breakpoint: "lg",
        sections: [{
          id: "sec_portfolio",
          stacks: [{
            id: "stk_portfolio",
            name: "Portfolio",
            rows: [{
              id: "row_portfolio",
              minHeight: null,
              alignment: "left",
              placements: [
                { id: "plc_behance", brickId: "brk_behance", layoutId: "default", placementState: {}, widthWeight: 400, spec: resolveBrickLayout({ moduleId: "behance", layoutId: "default", brickState: behanceView.def.state }) },
                { id: "plc_coffee", brickId: "brk_coffee", layoutId: "default", placementState: {}, widthWeight: 320, spec: resolveBrickLayout({ moduleId: "buy-me-a-coffee", layoutId: "default", brickState: buyMeACoffeeView.def.state }) },
              ],
            }],
          }],
        }],
      }],
    },
    renderBrick: (brick, placement) => {
      const { Render } = brick.moduleId === "behance" ? behanceView : buyMeACoffeeView;
      return <Render brickState={brick.brickState} placementState={placement.placementState} layoutId={placement.layoutId} spec={placement.spec} />;
    },
  },
} satisfies StoryObj<typeof meta>;
