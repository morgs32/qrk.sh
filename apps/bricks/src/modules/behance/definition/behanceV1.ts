import { makeEffectSchema, primitives } from "@zerospin/shapes";
import { Schema } from "effect";

import { defineComponentMetadata } from "../../../definition/defineComponentMetadata";
import { defineModule } from "../../../definition/defineModule";
import { brickShellComponentMetadata } from "../../../definition/layoutComponentMetadata";
import { makeModuleVersion } from "../../../definition/makeModuleVersion";
import { behanceProfileUrlSchema, behanceProjectSchema } from "./behanceSchemas";

const projectsSchema = Schema.Array(behanceProjectSchema).check(
  Schema.isMaxLength(4),
  Schema.makeFilter(
    (projects) =>
      new Set(projects.map(({ id }) => id)).size === projects.length ||
      "Expected unique Behance projects",
  ),
);

export const behanceCardComponentMetadata = defineComponentMetadata({
  type: "BehanceCard",
  propsShape: {
    url: primitives.json({ schema: behanceProfileUrlSchema }),
    displayName: primitives.text(),
    projects: primitives.json({ schema: projectsSchema }),
  },
  description: "Behance portfolio with a profile link and up to four linked project covers.",
});

export const behanceV1 = makeModuleVersion(
  defineModule({
    id: "behance",
    abbreviation: "beh",
    label: "Behance",
    description: "Selected projects from a public Behance portfolio.",
  }),
  {
    version: 1,
    variants: { default: { defaultWidth: 400, minWidth: 320, defaultHeight: 360 } },
    hasPlaceholder: true,
    componentMetadata: {
      BrickShell: brickShellComponentMetadata,
      BehanceCard: behanceCardComponentMetadata,
    },
    defaultSpec: {
      root: "shell",
      elements: {
        shell: { type: "BrickShell", props: {}, children: ["portfolio"] },
        portfolio: {
          type: "BehanceCard",
          props: {
            url: { $state: "/payload/url" },
            displayName: { $state: "/data/displayName" },
            projects: { $state: "/data/projects" },
          },
        },
      },
    },
    stateShape: {
      payload: primitives.json({ schema: Schema.Struct({ url: behanceProfileUrlSchema }) }),
      data: primitives.json({
        schema: Schema.Struct({ displayName: Schema.NonEmptyString, projects: projectsSchema }),
      }),
    },
  },
);

export const completeStateSchema = Schema.toType(makeEffectSchema(behanceV1.stateShape)).check(
  Schema.makeFilter((state) => state.data.projects.length > 0 || "Select at least one project"),
);
