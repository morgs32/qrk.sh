import { ImagePlaceholder } from "./ImagePlaceholder";
import { makeModuleView } from "../../make/makeModuleView";
import { registry } from "./generator/ImageJsonRenderRegistry";
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
    defaultWidth: 480,
    placeholder: ImagePlaceholder,
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
    generator: { registry, defaultSpec: imageV1.defaultSpec },
  },
});
