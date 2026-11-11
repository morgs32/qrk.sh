import { behanceView } from "@qrk.sh/bricks/modules/behance/view";
import { buyMeACoffeeView } from "@qrk.sh/bricks/modules/buyMeACoffee/view";
import { linkV1 } from "@qrk.sh/bricks/modules/link/definition";
import { linkPreviewState } from "@qrk.sh/bricks/modules/link/definition/linkPreviewState";
import { LinkLineIcon } from "@qrk.sh/bricks/modules/link/LinkLineIcon";
import { LinkPlaceholder } from "@qrk.sh/bricks/modules/link/LinkPlaceholder";
import { linkReactRegistry } from "@qrk.sh/bricks/modules/link/react";
import { makeModuleView } from "@qrk.sh/bricks/modules/react/makeModuleView";
import type { PageSnapshotSchemaV5 } from "@qrk.sh/zerospin/src/aggregates/user/snapshots/pageSnapshotSchemaV5";
import { articleV1 } from "@qrk.sh/bricks/modules/article/definition";
import { swatchAndIconV1 } from "@qrk.sh/bricks/modules/swatchAndIcon/definition";
import { swatchAndIconPreviewState } from "@qrk.sh/bricks/modules/swatchAndIcon/definition/swatchAndIconPreviewState";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { WallViewer } from "./WallViewer";

const linkView = makeModuleView(linkV1, {
  defaultState: linkPreviewState,
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
      state: swatchAndIconPreviewState,
      borderWidth: 0,
    },
    {
      id: "brk_gold",
      moduleId: "swatch-and-icon",
      state: { ...swatchAndIconPreviewState, payload: { hash: "", color: "#d6ad60" } },
      borderWidth: 0,
    },
    {
      id: "brk_field_notes",
      moduleId: "article",
      state: { title: "Field notes", subtitle: "", content: "A weekend away from the city." },
      borderWidth: 1,
    },
    {
      id: "brk_link",
      moduleId: "link",
      state: linkPreviewState,
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
                      variantId: "default",
                      spec: swatchAndIconV1.defaultSpec,
                    },
                    {
                      id: "plc_green",
                      brickId: "brk_green",
                      widthWeight: 180,
                      variantId: "default",
                      spec: swatchAndIconV1.defaultSpec,
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
                      variantId: "default",
                      spec: articleV1.defaultSpec,
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
                      variantId: "default",
                      spec: {
                        root: "card",
                        elements: {
                          card: { type: "LinkCard", props: {}, children: ["copy", "hero"] },
                          copy: {
                            type: "LinkCopy",
                            props: {
                              url: { $state: "/data/url" },
                              title: "A link saved on this Wall",
                              siteName: { $state: "/data/siteName" },
                              iconUrl: { $state: "/data/iconUrl" },
                            },
                          },
                          hero: {
                            type: "LinkHeroImage",
                            props: { imageUrl: { $state: "/data/imageUrl" } },
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
} satisfies typeof PageSnapshotSchemaV5.Type;

const meta = {
  title: "Web/WallViewer",
  component: WallViewer,
  parameters: { layout: "padded" },
  args: {
    snapshot,
    breakpoint: "lg",
    brickGap: 16,
    renderBrick: (brick, placement) => {
      const { state } = brick;
      if (brick.moduleId === "link") {
        return (
          <linkView.Render state={state} variantId={placement.variantId} spec={placement.spec} />
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
export const PublishedSnapshot = {} satisfies StoryObj<typeof meta>;


export const PortfolioSnapshot = {
  args: {
    snapshot: {
      ...snapshot,
      title: "Portfolio",
      bricks: [
        { id: "brk_behance", moduleId: "behance", state: behanceView.def.state, borderWidth: 0 },
        { id: "brk_coffee", moduleId: "buy-me-a-coffee", state: buyMeACoffeeView.def.state, borderWidth: 0 },
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
                { id: "plc_behance", brickId: "brk_behance", variantId: "default", widthWeight: 400, spec: behanceView.variants.default.spec },
                { id: "plc_coffee", brickId: "brk_coffee", variantId: "default", widthWeight: 320, spec: buyMeACoffeeView.variants.default.spec },
              ],
            }],
          }],
        }],
      }],
    },
    renderBrick: (brick, placement) => {
      const { Render } = brick.moduleId === "behance" ? behanceView : buyMeACoffeeView;
      return <Render state={brick.state} variantId={placement.variantId} spec={placement.spec} />;
    },
  },
} satisfies StoryObj<typeof meta>;
