import { defineRegistry } from "@json-render/react";
import { Images } from "lucide-react";
import {
  BrickDetailsTrigger,
} from "../../../components/BrickDetailsTrigger";
import { Skeleton } from "../../../components/skeleton";
import { makeCatalogFromComponentMetadata } from "../../../definition/makeCatalogFromComponentMetadata";
import { makeModuleView } from "../../react/makeModuleView";
import { imageCarouselV1 } from "../definition/imageCarouselV1";
import { ImageCarousel } from "./ImageCarousel";
import { ImageCarouselForm } from "./ImageCarouselForm";

const { registry } = defineRegistry(
  makeCatalogFromComponentMetadata(imageCarouselV1.componentMetadata),
  {
    components: { ImageCarousel },
  },
);

const carousel = makeModuleView(imageCarouselV1, {
  categoryIds: ["tools"],
  defaultState: { slides: [
    { id: "first", imageUrl: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?auto=format&fit=crop&w=800&q=80", alt: "Mountains beside a lake", crop: null },
    { id: "second", imageUrl: "https://images.unsplash.com/photo-1470770841072-f978cf4d019e?auto=format&fit=crop&w=800&q=80", alt: "A mountain landscape", crop: null },
  ], interval: 5 },
  LineIcon: Images,
  form: ImageCarouselForm,
  variants: {
    default: {
      placeholder: () => (
        <Skeleton className="size-full min-h-48 motion-reduce:animate-none" />
      ),
      registry,
    },
  },
});

export const imageCarouselView = {
  ...carousel,
  Render(props: Parameters<typeof carousel.Render>[0]) {
    const { state, variantId, spec } = props;
    return (
      <BrickDetailsTrigger label={`Edit ${carousel.label}`}>
        <carousel.Render state={state} variantId={variantId} spec={spec} />
      </BrickDetailsTrigger>
    );
  },
};
