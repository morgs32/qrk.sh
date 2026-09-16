import { primitives } from "@zerospin/schema";

import { makeModule } from "../../make/makeModule";
import { makeOptions } from "../../make/makeOptions";

import { defaultSpec } from "./generative/defaultSpec";
import { registry } from "./generative/ImageJsonRenderRegistry";
import { ImageOptionsForm } from "./ImageOptionsForm";

export const image = makeModule({
  id: "image",
  label: "Image",
  description: "An editorial image preview.",
  defaultSpec,
  registry,
  dataShape: {
    imageUrl: primitives.text(),
    title: primitives.text(),
  },
  defaultData: {
    imageUrl:
      "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?auto=format&fit=crop&w=800&q=80",
    title: "White Bay Power Station",
  },
  options: makeOptions({
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
    form: ImageOptionsForm,
  }),
  sm: { w: 4, h: 4 },
  lg: { w: 3, h: 3 },
});
