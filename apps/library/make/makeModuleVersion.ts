import { defineCatalog, type Catalog } from "@json-render/core";
import { schema } from "@json-render/react/schema";
import { primitives, type InferDecodedRow, type IShape } from "@zerospin/schema";
import { descriptorToZod, makeZodSchema } from "@zerospin/zod";
import { mapValues } from "es-toolkit";

import type { IJsonValue } from "../worker/types.public";
import { decodeDefaultData } from "./decodeDefaultData";
import type { defineComponent } from "./defineComponent";
import { defineModule } from "./defineModule";

const stateRefSchema = makeZodSchema({
  $state: primitives.text(),
});

const semVerPattern =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

function assertSemVer(version: string) {
  if (!semVerPattern.test(version)) {
    throw new Error(`makeModuleVersion: version must be SemVer; got ${JSON.stringify(version)}`);
  }
}

function makeCatalogFromComponents(
  components: Record<string, ReturnType<typeof defineComponent>>,
): Catalog {
  for (const [key, component] of Object.entries(components)) {
    if (key !== component.type) {
      throw new Error(
        `makeModuleVersion: components key ${JSON.stringify(key)} must equal type ${JSON.stringify(component.type)}`,
      );
    }
  }

  const catalogComponents = mapValues(components, component => {
    const dynamicProps = makeZodSchema({}).extend(
      mapValues(component.props, descriptor => {
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
  const VERSION extends string,
  const STATE_SHAPE extends IShape,
>(
  identity: Readonly<{
    id: MODULE;
    label: string;
    description: string;
  }>,
  props: {
    version: VERSION;
    components: Record<string, ReturnType<typeof defineComponent>>;
    stateShape: STATE_SHAPE;
    defaultState: InferDecodedRow<STATE_SHAPE> & Readonly<Record<string, IJsonValue>>;
  },
) {
  const { id, label, description } = defineModule(identity);
  assertSemVer(props.version);

  const catalog = makeCatalogFromComponents(props.components);
  const defaultState = decodeDefaultData(props.stateShape, props.defaultState);

  const def = {
    moduleId: id,
    state: defaultState as unknown,
  };

  return {
    id,
    label,
    description,
    version: props.version,
    catalog,
    components: props.components,
    stateShape: props.stateShape,
    defaultState,
    def,
  };
}
