import { defineCatalog, type Catalog } from "@json-render/core";
import { schema } from "@json-render/react/schema";
import { primitives } from "@zerospin/shapes";
import { descriptorToZod, makeZodSchema } from "@zerospin/zod";
import { mapValues } from "es-toolkit";

import type { defineComponentMetadata } from "./defineComponentMetadata";

const stateRefSchema = makeZodSchema({
  $state: primitives.text(),
});

export function makeCatalogFromComponentMetadata(
  componentMetadata: Record<string, ReturnType<typeof defineComponentMetadata>>,
): Catalog {
  const catalogComponents = mapValues(componentMetadata, (metadata) => {
    const dynamicProps = makeZodSchema({}).extend(
      mapValues(metadata.propsShape, (descriptor) => {
        const dynamicField = descriptorToZod(descriptor).or(stateRefSchema);
        if (
          descriptor !== undefined &&
          typeof descriptor === "object" &&
          "nullable" in descriptor &&
          descriptor.nullable === true
        ) {
          return dynamicField.optional();
        }
        return dynamicField;
      }),
    );

    return {
      props: dynamicProps,
      ...(metadata.slots === undefined ? {} : { slots: [...metadata.slots] }),
      ...(metadata.description === undefined ? {} : { description: metadata.description }),
    };
  });

  return defineCatalog(schema, {
    components: catalogComponents,
    actions: {},
  });
}
