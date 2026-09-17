import { primitives } from "@zerospin/schema";

import { defineModule } from "../../make/defineModule";
import { makeData } from "../../make/makeData";
import { defaultSpec } from "./generative/defaultSpec";
import { imageJsonRenderCatalog } from "./generative/ImageJsonRenderCatalog";

export const image = defineModule({
  id: "image",
  label: "Image",
  description: "An editorial image preview.",
  catalog: imageJsonRenderCatalog,
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
