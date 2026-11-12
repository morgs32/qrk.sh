import { useStateValue } from "@json-render/react";
import { primitives } from "@zerospin/shapes";
import { CroppedImage } from "../../../components/CroppedImage";
import { imageCropSchema } from "../definition/imageV2";
import { Image as UnpicImage } from "@unpic/react";
import { makeComponentView } from "../../react/makeComponentView";
import { imageCoverComponentMetadata } from "../definition/generator/ImageCoverComponentMetadata";

export const imageCoverView = makeComponentView(
  {
    propsShape: {
      ...imageCoverComponentMetadata.propsShape,
      round: primitives.boolean(),
      crop: primitives.json({ schema: imageCropSchema, nullable: true }),
    },
  },
  {
    component(props) {
      const { imageUrl, title, imagePosition, crop, round } = props;
      const photo = (
        <div
          data-image-cover
          className={round
            ? "absolute left-1/2 top-1/2 size-[min(100cqw,100cqh)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-full"
            : "relative min-h-[200px] min-w-[200px] flex-1 overflow-hidden"}
        >
          {crop !== null ? (
            <CroppedImage key={imageUrl} src={imageUrl} alt={title} crop={crop} />
          ) : (
            <UnpicImage
              src={imageUrl}
              alt={title}
              className="absolute inset-0 size-full object-cover object-center data-[image-position=top-left]:object-left-top data-[image-position=top-center]:object-top data-[image-position=top-right]:object-right-top data-[image-position=center-left]:object-left data-[image-position=center-right]:object-right data-[image-position=bottom-left]:object-left-bottom data-[image-position=bottom-center]:object-bottom data-[image-position=bottom-right]:object-right-bottom"
              data-image-position={imagePosition}
              layout="fullWidth"
              sizes="(max-width: 768px) 100vw, 50vw"
            />
          )}
        </div>
      );
      return round ? (
        <div className="relative min-h-[200px] min-w-[200px] flex-1 [container-type:size]">
          {photo}
        </div>
      ) : photo;
    },
  },
);

export function ImageCoverRegistry(props: Parameters<typeof imageCoverView.RegistryComponent>[0]) {
  const { props: resolvedProps, children } = props;
  const crop = useStateValue<typeof imageCropSchema.Type | null>("/crop") ?? null;
  const round = useStateValue<boolean>("/round") === true;
  return (
    <imageCoverView.RegistryComponent {...props} props={{ ...(resolvedProps ?? {}), crop, round }}>
      {children}
    </imageCoverView.RegistryComponent>
  );
}
