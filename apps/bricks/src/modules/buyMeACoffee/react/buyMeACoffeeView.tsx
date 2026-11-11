import { defineRegistry } from "@json-render/react";
import { Coffee } from "lucide-react";

import { BrickDetailsTrigger } from "../../../components/BrickDetailsTrigger";
import { makeCatalogFromComponentMetadata } from "../../../definition/makeCatalogFromComponentMetadata";
import { layoutRegistryComponents } from "../../react/layoutRegistryComponents";
import { makeModuleView } from "../../react/makeModuleView";
import { buyMeACoffeeV1 } from "../definition/buyMeACoffeeV1";
import { buyMeACoffeeCardView } from "./BuyMeACoffeeCard";
import { BuyMeACoffeeForm } from "./BuyMeACoffeeForm";

const { registry } = defineRegistry(
  makeCatalogFromComponentMetadata(buyMeACoffeeV1.componentMetadata),
  {
    components: {
      ...layoutRegistryComponents,
      BuyMeACoffeeCard: buyMeACoffeeCardView.RegistryComponent,
    },
  },
);

const view = makeModuleView(buyMeACoffeeV1, {
  defaultState: {
    payload: {
      url: "https://buymeacoffee.com/example",
      message: "Help me make more illustrations.",
    },
  },
  LineIcon: Coffee,
  form: BuyMeACoffeeForm,
  variants: {
    default: {
      registry,
      placeholder() {
        return (
          <div className="grid min-h-24 place-items-center p-3 text-center text-sm">
            Add a Buy Me a Coffee page
          </div>
        );
      },
    },
  },
});

export const buyMeACoffeeView = {
  ...view,
  Render(props: Parameters<typeof view.Render>[0]) {
    const { state, spec, variantId } = props;
    return (
      <BrickDetailsTrigger label="Edit Buy Me a Coffee">
        <view.Render state={state} spec={spec} variantId={variantId} />
      </BrickDetailsTrigger>
    );
  },
};
