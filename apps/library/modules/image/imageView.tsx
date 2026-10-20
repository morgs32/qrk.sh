import { makeModuleView } from "../../make/makeModuleView";
import { registry } from "./generator/ImageJsonRenderRegistry";
import { defaultSpec } from "./generator/defaultSpec";
import { imageV1 } from "./imageV1";
import { MediaFooter } from "../../components/brick/MediaFooter";
import { imageCardView } from "./ImageCard";
import { imageCoverView } from "./ImageCover";
import { ImageForm } from "./ImageForm";
import { ImageLineIcon } from "./ImageLineIcon";

export const imageView = makeModuleView(imageV1, {
  LineIcon: ImageLineIcon,
  form: ImageForm,
  default: {
    placeholder() {
      return (
        <imageCardView.Component>
          <imageCoverView.Component
            imagePosition="center"
            imageUrl={imageV1.defaultState.imageUrl}
            title={imageV1.defaultState.title}
          />
        </imageCardView.Component>
      );
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
