import { useStateValue } from "@json-render/react";
import { primitives } from "@zerospin/shapes";
import { BrickShell } from "../../../components/BrickShell";
import { makeComponentView } from "../../react/makeComponentView";
import { imageCardComponentMetadata } from "../definition/generator/ImageCardComponentMetadata";

export const imageCardView = makeComponentView(
  { propsShape: { ...imageCardComponentMetadata.propsShape, round: primitives.boolean() } },
  {
    component(props) {
      const { children, round } = props;
      return (
        <BrickShell className={round ? "min-w-[200px] overflow-hidden" : "min-w-[200px] overflow-hidden bg-white"}>
          {children}
        </BrickShell>
      );
    },
  },
);

export function ImageCardRegistry(props: Parameters<typeof imageCardView.RegistryComponent>[0]) {
  const { props: resolvedProps } = props;
  const round = useStateValue<boolean>("/round") === true;
  return <imageCardView.RegistryComponent {...props} props={{ ...(resolvedProps ?? {}), round }} />;
}
