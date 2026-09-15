import { primitives } from "@zerospin/schema";

import { makeModule } from "../../makeModule";
import { makeOptions } from "../../makeOptions";

import { DEFAULT_IMAGE_SRC, ImageOptionsForm } from "./ImageOptionsForm";
import { ImageDefaultPromo } from "./ImageDefaultPromo";

export const image = makeModule({
  dataShape: null,
  defaultData: null,
  id: "image",
  label: "Image",
  description: "An editorial image preview.",
  options: makeOptions({
    shape: {
      src: primitives.text({
        defaultValue: DEFAULT_IMAGE_SRC,
      }),
    },
    form: ImageOptionsForm,
  }),
  xs: { component: ImageDefaultPromo, w: 4, h: 4 },
});
