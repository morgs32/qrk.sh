import { primitives } from "@zerospin/shapes";

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
  content: primitives.text({
    nullable: true,
    defaultValue: null,
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
    content: `1. Applicable to anybody
2. Likely to help and unlikely to harm
3. Things I have actually tried and worked for me/things I have seen work for other people
4. Useful even without lots of context and wisdom

Here’s what I got.`,
  },
});
