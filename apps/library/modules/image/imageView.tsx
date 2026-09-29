import { makeModuleView } from "../../make/makeModuleView";
import { registry } from "./generator/ImageJsonRenderRegistry";
import { defaultSpec } from "./generator/defaultSpec";
import { imageV1 } from "./imageV1";
import { MediaFooter } from "../../components/brick/MediaFooter";
import { Skeleton } from "../../components/ui/skeleton";
import { imageCardView } from "./ImageCard";
import { imageCoverView } from "./ImageCover";

export const imageView = makeModuleView(imageV1, {
  default: {
    placeholder() {
      return <Skeleton className="size-full" />;
    },
    component(props) {
      const { state } = props;
      return (
        <imageCardView.Component>
          <imageCoverView.Component
            imagePosition="center"
            imageUrl={state.imageUrl}
            title={state.title}
          />
          <MediaFooter heading={state.title} />
        </imageCardView.Component>
      );
    },
    generator: { registry, defaultSpec },
  },
});
