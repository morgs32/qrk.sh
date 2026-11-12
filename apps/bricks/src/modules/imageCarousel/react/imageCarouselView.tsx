import { defineRegistry } from "@json-render/react";
import { Images } from "lucide-react";
import { useContext } from "react";
import {
  BrickDetailsContext,
  BrickDetailsTrigger,
} from "../../../components/BrickDetailsTrigger";
import { Skeleton } from "../../../components/skeleton";
import { makeCatalogFromComponentMetadata } from "../../../definition/makeCatalogFromComponentMetadata";
import { useAfterBrickInserted } from "../../react/useAfterBrickInserted";
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
  defaultState: { slides: [], interval: 5 },
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
    const openDetails = useContext(BrickDetailsContext);
    useAfterBrickInserted(() => {
      openDetails?.();
    });
    return (
      <BrickDetailsTrigger label={`Edit ${carousel.label}`}>
        <carousel.Render state={state} variantId={variantId} spec={spec} />
      </BrickDetailsTrigger>
    );
  },
};
