import { defineCatalog, type Catalog, type Spec } from "@json-render/core";
import { schema } from "@json-render/react/schema";
import { primitives, type IInferDecodedRow, type IShape } from "@zerospin/shapes";
import { descriptorToZod, makeZodSchema } from "@zerospin/zod";
import { mapValues } from "es-toolkit";

import type { IJsonValue } from "../types";
import { decodeDefaultData } from "./decodeDefaultData";
import type { defineComponentMetadata } from "./defineComponentMetadata";
import { defineModule } from "./defineModule";

const stateRefSchema = makeZodSchema({
  $state: primitives.text(),
});

function makeCatalogFromComponentMetadata(
  componentMetadata: Record<string, ReturnType<typeof defineComponentMetadata>>,
): Catalog {
  const catalogComponents = mapValues(componentMetadata, (metadata, key) => {
    if (key !== metadata.type) {
      throw new Error(
        `makeModuleVersion: componentMetadata key ${JSON.stringify(key)} must equal type ${JSON.stringify(metadata.type)}`,
      );
    }
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

/** Versioned module snapshot: component metadata, catalog, and state document. */
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
    maxPerPage?: number | undefined;
  }>,
  props: {
    version: VERSION;
    variants: {
      default: {
        /** Preferred rendered width in pixels, shared by previews and placed Bricks. */
        defaultWidth: number;
        /** Minimum rendered width in pixels. */
        minWidth: 160 | 320;
        /** Preferred height in pixels; null follows content and requires an exclusive Row. */
        defaultHeight: 45 | 90 | 180 | 360 | 720 | null;
        /** Optional minimum above the shared 45px floor. */
        minHeight?: 90 | 180 | 360 | 720;
      };
    };
    defaultSpec: Spec;
    hasPlaceholder: boolean;
    componentMetadata: Record<string, ReturnType<typeof defineComponentMetadata>>;
    stateShape: STATE_SHAPE;
    defaultState: IInferDecodedRow<STATE_SHAPE> & Readonly<Record<string, IJsonValue>>;
  },
) {
  const {
    version,
    variants,
    defaultSpec,
    componentMetadata,
    stateShape,
    defaultState: suppliedDefaultState,
    hasPlaceholder,
  } = props;
  const { id, abbreviation, label, description, maxPerPage } = defineModule(identity);
  if (!Number.isSafeInteger(version) || version < 1) {
    throw new Error("makeModuleVersion: version must be a positive safe integer");
  }

  if (!Number.isFinite(variants.default.defaultWidth) || variants.default.defaultWidth <= 0) {
    throw new Error("makeModuleVersion: defaultWidth must be a positive finite number");
  }

  const catalog = makeCatalogFromComponentMetadata(componentMetadata);
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
    variants,
    defaultSpec,
    hasPlaceholder,
    catalog,
    componentMetadata,
    stateShape,
    defaultState,
    def,
  };
}
