"use client";

import { defineRegistry, useStateValue } from "@json-render/react";
import { makeCatalogFromComponentMetadata } from "../../../definition/makeCatalogFromComponentMetadata";
import { makeEffectSchema } from "@zerospin/shapes";
import { Schema } from "effect";

import { iconSvgGraphicView } from "../SwatchAndIcon/components/IconSvgGraphic";
import { swatchAndIconColorView } from "../SwatchAndIcon/components/SwatchAndIconColor";
import { swatchAndIconV1 } from "../../definition/swatchAndIconV1";
import { swatchAndIconColorComponentMetadata } from "../../definition/generator/SwatchAndIconColorComponentMetadata";

export const { registry } = defineRegistry(
  makeCatalogFromComponentMetadata(swatchAndIconV1.componentMetadata),
  {
    components: {
      IconSvgGraphic: iconSvgGraphicView.RegistryComponent,
      SwatchAndIconColor(context) {
        const componentProps = Schema.decodeUnknownSync(
          Schema.toType(makeEffectSchema(swatchAndIconColorComponentMetadata.propsShape)),
        )(context.props, { onExcessProperty: "error" });
        const color = useStateValue<unknown>("/payload/color");
        if (typeof color !== "string") {
          throw new Error("Swatch and Icon requires a saved color.");
        }
        return (
          <swatchAndIconColorView.RegistryComponent
            {...context}
            props={{ ...componentProps, color }}
          />
        );
      },
    },
  },
);
