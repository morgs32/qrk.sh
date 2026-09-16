import { primitives } from "@zerospin/schema";

import { makeModule } from "../../make/makeModule";

import { ImageAndTitle } from "./ImageAndTitle";

export const image = makeModule({
  id: "image",
  label: "Image",
  description: "An editorial image preview.",
  dataShape: {
    imageUrl: primitives.text(),
    title: primitives.text(),
  },
  defaultData: {
    imageUrl:
      "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?auto=format&fit=crop&w=800&q=80",
    title: "White Bay Power Station",
  },
  sm: { component: ImageAndTitle, w: 4, h: 4 },
  lg: { component: ImageAndTitle, w: 3, h: 3 },
});
