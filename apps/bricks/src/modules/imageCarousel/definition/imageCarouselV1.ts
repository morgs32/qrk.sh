import { primitives } from "@zerospin/shapes";
import { Schema } from "effect";
import { defineComponentMetadata } from "../../../definition/defineComponentMetadata";
import { defineModule } from "../../../definition/defineModule";
import { makeModuleVersion } from "../../../definition/makeModuleVersion";
import { imageCropSchema } from "../../image/definition/imageV2";

const imageCarousel = defineModule({
  id: "image-carousel",
  abbreviation: "icr",
  label: "Image Carousel",
  description: "A rotating collection of images.",
});

export const imageCarouselSlidesSchema = Schema.mutable(
  Schema.Array(
    Schema.Struct({
      id: Schema.String,
      imageUrl: Schema.String,
      alt: Schema.String,
      crop: Schema.NullOr(imageCropSchema),
    }),
  ),
);

export const imageCarouselComponentMetadata = defineComponentMetadata({
  type: "ImageCarousel",
  propsShape: {},
  description: "An image carousel using the module's slide and interval state.",
});

export const imageCarouselV1 = makeModuleVersion(imageCarousel, {
  version: 1,
  variants: {
    default: { defaultWidth: 480, minWidth: 320, defaultHeight: 360 },
  },
  defaultSpec: {
    root: "carousel",
    elements: { carousel: { type: "ImageCarousel", props: {} } },
  },
  hasPlaceholder: true,
  componentMetadata: { ImageCarousel: imageCarouselComponentMetadata },
  stateShape: {
    slides: primitives.json({ schema: imageCarouselSlidesSchema }),
    interval: primitives.json({
      schema: Schema.Int.check(Schema.isBetween({ minimum: 3, maximum: 10 })),
    }),
  },
});
