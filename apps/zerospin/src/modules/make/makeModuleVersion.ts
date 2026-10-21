import { defineCatalog, type Catalog, type Spec } from "@json-render/core";
import { schema } from "@json-render/react/schema";
import { primitives, type IInferDecodedRow, type IShape } from "@zerospin/shapes";
import { descriptorToZod, makeZodSchema } from "@zerospin/zod";
import { mapValues } from "es-toolkit";

import type { IJsonValue } from "../types";
import { decodeDefaultData } from "./decodeDefaultData";
import type { defineComponent } from "./defineComponent";
import { defineModule } from "./defineModule";

const stateRefSchema = makeZodSchema({
  $state: primitives.text(),
});

function makeCatalogFromComponents(
  components: Record<string, ReturnType<typeof defineComponent>>,
): Catalog {
  const catalogComponents = mapValues(components, (component, key) => {
    if (key !== component.type) {
      throw new Error(
        `makeModuleVersion: components key ${JSON.stringify(key)} must equal type ${JSON.stringify(component.type)}`,
      );
    }
    const dynamicProps = makeZodSchema({}).extend(
      mapValues(component.props, (descriptor) => {
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
      ...(component.slots === undefined ? {} : { slots: [...component.slots] }),
      ...(component.description === undefined ? {} : { description: component.description }),
    };
  });

  return defineCatalog(schema, {
    components: catalogComponents,
    actions: {},
  });
}

/** Versioned module snapshot: components→catalog, state document. */
export function makeModuleVersion<
  const MODULE extends string,
  const ABBREVIATION extends string,
  const VERSION extends number,
  const STATE_SHAPE extends IShape,
>(
  identity: Readonly<{
    id: MODULE;
    abbreviation: ABBREVIATION;
    label: string;
    description: string;
    maxPerPage?: number;
  }>,
  props: {
    version: VERSION;
    defaultSpec: Spec;
    hasPlaceholder?: boolean;
    components: Record<string, ReturnType<typeof defineComponent>>;
    stateShape: STATE_SHAPE;
    defaultState: IInferDecodedRow<STATE_SHAPE> & Readonly<Record<string, IJsonValue>>;
  },
) {
  const {
    version,
    defaultSpec,
    components,
    stateShape,
    defaultState: suppliedDefaultState,
    hasPlaceholder = false,
  } = props;
  const { id, abbreviation, label, description, maxPerPage } = defineModule(identity);
  if (!Number.isSafeInteger(version) || version < 1) {
    throw new Error("makeModuleVersion: version must be a positive safe integer");
  }

  const catalog = makeCatalogFromComponents(components);
  const defaultState = decodeDefaultData(stateShape, suppliedDefaultState);

  const def = {
    moduleId: id,
    state: defaultState as unknown,
  };

  return {
    id,
    abbreviation,
    label,
    description,
    maxPerPage,
    version,
    defaultSpec,
    hasPlaceholder,
    catalog,
    components,
    stateShape,
    defaultState,
    def,
  };
}
