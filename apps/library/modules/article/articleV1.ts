import { primitives } from "@zerospin/shapes";

import { TiptapDocSchema } from "../../lib/TiptapDocSchema";
import {
  brickBodyComponent,
  brickFooterComponent,
  brickShellComponent,
  columnComponent,
  rowComponent,
} from "../../lib/jsonRender/layoutComponents";
import { makeModuleVersion } from "../../make/makeModuleVersion";
import { articleBrickComponent } from "./generator/ArticleBrickComponent";
import { article } from "./article";

const dataShape = {
  title: primitives.text(),
  subtitle: primitives.text(),
  content: primitives.json({
    nullable: true,
    defaultValue: null,
    schema: TiptapDocSchema,
  }),
};

export const articleV1 = makeModuleVersion(article, {
  version: "1.0.0",
  components: {
    BrickShell: brickShellComponent,
    BrickBody: brickBodyComponent,
    BrickFooter: brickFooterComponent,
    Column: columnComponent,
    Row: rowComponent,
    ArticleBrick: articleBrickComponent,
  },
  stateShape: dataShape,
  defaultState: {
    title: "Actually good advice",
    subtitle: "For a long time, I’ve been collecting pieces of advice that are:",
    content: {
      type: "doc",
      content: [
        {
          type: "orderedList",
          attrs: { start: 1 },
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Applicable to anybody" }],
                },
              ],
            },
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Likely to help and unlikely to harm" }],
                },
              ],
            },
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [
                    {
                      type: "text",
                      text: "Things I have actually tried and worked for me/things I have seen work for other people",
                    },
                  ],
                },
              ],
            },
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [
                    { type: "text", text: "Useful even without lots of context and wisdom" },
                  ],
                },
              ],
            },
          ],
        },
        {
          type: "paragraph",
          content: [{ type: "text", text: "Here’s what I got." }],
        },
      ],
    },
  },
});
