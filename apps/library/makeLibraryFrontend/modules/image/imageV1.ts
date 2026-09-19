import { primitives } from "@zerospin/schema";

import {
  brickBodyComponent,
  brickFooterComponent,
  brickShellComponent,
  columnComponent,
  rowComponent,
} from "../../lib/jsonRender/layoutComponents";
import { makeModuleVersion } from "../../make/makeModuleVersion";
import { imageCardComponent } from "./generative/ImageCardComponent";
import { imageCoverComponent } from "./generative/ImageCoverComponent";
import { mediaFooterComponent } from "./generative/MediaFooterComponent";
import { image } from "./image";

const dataShape = {
  imageUrl: primitives.text(),
  title: primitives.text(),
};

const defaultData = {
  imageUrl:
    "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?auto=format&fit=crop&w=800&q=80",
  title: "White Bay Power Station",
};

export const imageV1 = makeModuleVersion(image, {
  version: "1.0.0",
  components: {
    BrickShell: brickShellComponent,
    BrickBody: brickBodyComponent,
    BrickFooter: brickFooterComponent,
    Column: columnComponent,
    Row: rowComponent,
    ImageCard: imageCardComponent,
    ImageCover: imageCoverComponent,
    MediaFooter: mediaFooterComponent,
  },
  stateShape: dataShape,
  defaultState: defaultData,
});
