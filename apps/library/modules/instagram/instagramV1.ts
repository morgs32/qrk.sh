import { makeEffectSchema, primitives } from "@zerospin/schema";

import {
  brickBodyComponent,
  brickFooterComponent,
  brickShellComponent,
  columnComponent,
  rowComponent,
} from "../../lib/jsonRender/layoutComponents";
import { makeModuleVersion } from "../../make/makeModuleVersion";
import { instagramCardComponent } from "./generative/InstagramCardComponent";
import { instagramMediaFooterComponent } from "./generative/InstagramMediaFooterComponent";
import { instagramPostGridComponent } from "./generative/InstagramPostGridComponent";
import { instagram } from "./instagram";

const payloadShape = {
  url: primitives.text({
    defaultValue: "https://www.instagram.com/theonion/",
  }),
};

const dataShape = {
  username: primitives.text(),
  profileImageUrl: primitives.text(),
  followersText: primitives.text(),
  postImageUrl1: primitives.text(),
  postImageUrl2: primitives.text(),
  postImageUrl3: primitives.text(),
  postImageUrl4: primitives.text(),
};

const defaultData = {
  username: "theonion",
  profileImageUrl: "https://www.instagram.com/static/images/ico/favicon-192.png/68d99ba29cc8.png",
  followersText: "5M",
  postImageUrl1:
    "https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?auto=format&fit=crop&w=800&q=80",
  postImageUrl2:
    "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?auto=format&fit=crop&w=800&q=80",
  postImageUrl3:
    "https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=800&q=80",
  postImageUrl4:
    "https://images.unsplash.com/photo-1469474968028-56623f02e42e?auto=format&fit=crop&w=800&q=80",
};

export const instagramV1 = makeModuleVersion(instagram, {
  version: "1.0.0",
  components: {
    BrickShell: brickShellComponent,
    BrickBody: brickBodyComponent,
    BrickFooter: brickFooterComponent,
    Column: columnComponent,
    Row: rowComponent,
    InstagramCard: instagramCardComponent,
    InstagramPostGrid: instagramPostGridComponent,
    InstagramMediaFooter: instagramMediaFooterComponent,
  },
  stateShape: {
    payload: primitives.json({ schema: makeEffectSchema(payloadShape) }),
    data: primitives.json({ schema: makeEffectSchema(dataShape) }),
  },
  defaultState: {
    payload: { url: "https://www.instagram.com/theonion/" },
    data: defaultData,
  },
});
