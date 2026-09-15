import { makeModule } from "../../makeModule";

import { ImageDefaultPromo } from "./ImageDefaultPromo";

export const image = makeModule({
  dataShape: null,
  defaultData: null,
  id: "image",
  label: "Image",
  description: "An editorial image preview.",
  xs: { component: ImageDefaultPromo, w: 4, h: 4 }});
