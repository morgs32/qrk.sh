import { makeModelVersion } from "@zerospin/core/models/make/makeModelVersion";
import { primitives } from "@zerospin/shapes";
import { Schema } from "effect";

import type { IBackendLibrary } from "../../../backendLibrary";
import { wallModelV1 } from "../wall/wallModelV1";
import { brick } from "./brick";

export function makeBrickModel(props: { library: IBackendLibrary; wall: typeof wallModelV1 }) {
  const { library, wall } = props;
  const moduleIdValues = Object.keys(library) as [
    keyof IBackendLibrary,
    ...Array<keyof IBackendLibrary>,
  ];

  return makeModelVersion(brick, {
    attributes: {
      wallId: primitives.ref({
        table: wall.table,
        relation: "wall",
        inverse: "bricks",
      }),
      moduleId: primitives.enum({
        values: moduleIdValues,
      }),
      stateRevision: primitives.integer({ defaultValue: 0 }),
      state: primitives.json({ schema: Schema.Unknown }),
    },
    indexes: [],
    version: "1.0.0",
  });
}
