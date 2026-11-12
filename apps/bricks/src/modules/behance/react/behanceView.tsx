import { defineRegistry } from "@json-render/react";
import { Images } from "lucide-react";

import { BrickDetailsTrigger } from "../../../components/BrickDetailsTrigger";
import { makeCatalogFromComponentMetadata } from "../../../definition/makeCatalogFromComponentMetadata";
import { layoutRegistryComponents } from "../../react/layoutRegistryComponents";
import { makeModuleView } from "../../react/makeModuleView";
import { behanceV1 } from "../definition/behanceV1";
import { behanceCardView } from "./BehanceCard";
import { BehanceForm } from "./BehanceForm";

const { registry } = defineRegistry(makeCatalogFromComponentMetadata(behanceV1.componentMetadata), {
  components: {
    ...layoutRegistryComponents,
    BehanceCard: behanceCardView.RegistryComponent,
  },
});

const view = makeModuleView(behanceV1, {
  categoryIds: ["new", "social"],
  defaultState: {
    payload: { url: "https://www.behance.net/grapheine" },
    data: {
      displayName: "Graphéine",
      projects: [
        {
          id: "258296801",
          title: "Marraud Group",
          url: "https://www.behance.net/gallery/258296801/Marraud-Group",
          coverUrl:
            "https://mir-s3-cdn-cf.behance.net/projects/808/8c261b258296801.Y3JvcCw0MjgzLDMzNTAsMTI1MSw0MTM.jpg",
        },
      ],
    },
  },
  LineIcon: Images,
  form: BehanceForm,
  variants: {
    default: {
      registry,
      placeholder() {
        return (
          <div className="grid min-h-24 place-items-center p-3 text-center text-sm">
            Add a Behance profile
          </div>
        );
      },
    },
  },
});

export const behanceView = {
  ...view,
  Render(props: Parameters<typeof view.Render>[0]) {
    const { state, spec, variantId } = props;
    return (
      <BrickDetailsTrigger label="Edit Behance">
        <view.Render state={state} spec={spec} variantId={variantId} />
      </BrickDetailsTrigger>
    );
  },
};
