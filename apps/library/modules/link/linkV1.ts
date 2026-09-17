import { makeEffectSchema, primitives } from "@zerospin/schema";

import {
  brickBodyComponent,
  brickFooterComponent,
  brickShellComponent,
  columnComponent,
  rowComponent,
} from "../../lib/jsonRender/layoutComponents";
import { makeModuleVersion } from "../../make/makeModuleVersion";
import { linkCardComponent } from "./generative/LinkCardComponent";
import { linkCopyComponent } from "./generative/LinkCopyComponent";
import { linkHeroImageComponent } from "./generative/LinkHeroImageComponent";
import { link } from "./link";

const payloadShape = {
  url: primitives.text({
    defaultValue: "https://apps.apple.com/us/app/apple-store/id375380948",
  }),
};

const dataShape = {
  url: primitives.text(),
  title: primitives.text(),
  description: primitives.text(),
  siteName: primitives.text(),
  imageUrl: primitives.text(),
  iconUrl: primitives.text(),
};

const defaultData = {
  url: "https://apps.apple.com/",
  title: "Celebrate our birthday & get Pro free for one year",
  description: "Hmm a brief description of the link",
  siteName: "apps.apple.com",
  imageUrl:
    "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?auto=format&fit=crop&w=800&q=80",
  iconUrl: "https://www.apple.com/favicon.ico",
};

export const linkV1 = makeModuleVersion(link, {
  version: "1.0.0",
  components: {
    BrickShell: brickShellComponent,
    BrickBody: brickBodyComponent,
    BrickFooter: brickFooterComponent,
    Column: columnComponent,
    Row: rowComponent,
    LinkCard: linkCardComponent,
    LinkCopy: linkCopyComponent,
    LinkHeroImage: linkHeroImageComponent,
  },
  stateShape: {
    payload: primitives.json({ schema: makeEffectSchema(payloadShape) }),
    data: primitives.json({ schema: makeEffectSchema(dataShape) }),
  },
  defaultState: {
    payload: { url: "https://apps.apple.com/us/app/apple-store/id375380948" },
    data: defaultData,
  },
  breakpoints: {
    sm: {},
  },
});
