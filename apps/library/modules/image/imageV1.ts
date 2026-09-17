import { primitives } from "@zerospin/schema";

import {
  brickBodyComponent,
  brickFooterComponent,
  brickShellComponent,
  columnComponent,
  rowComponent,
} from "../../lib/jsonRender/layoutComponents";
import { makeData } from "../../make/makeData";
import { makeModuleVersion } from "../../make/makeModuleVersion";
import { defaultSpec } from "./generative/defaultSpec";
import { imageCardComponent } from "./generative/ImageCardComponent";
import { imageCoverComponent } from "./generative/ImageCoverComponent";
import { mediaFooterComponent } from "./generative/MediaFooterComponent";
import { image } from "./image";

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
  data: makeData({
    dataShape: {
      imageUrl: primitives.text(),
      title: primitives.text(),
    },
    defaultData: {
      imageUrl:
        "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?auto=format&fit=crop&w=800&q=80",
      title: "White Bay Power Station",
    },
  }),
  breakpoints: {
    sm: {
      defaultSpec,
      options: {
        shape: {
          imagePosition: primitives.enum({
            values: [
              "top-left",
              "top-center",
              "top-right",
              "center-left",
              "center",
              "center-right",
              "bottom-left",
              "bottom-center",
              "bottom-right",
            ],
            defaultValue: "center",
          }),
        },
      },
    },
  },
});
