import {
  defineCatalog,
  DynamicNumberSchema,
  DynamicStringSchema,
} from "@json-render/core";
import { schema } from "@json-render/react/schema";
import { z } from "zod";

import { layoutCatalogComponents } from "../../../lib/jsonRender/layoutCatalogComponents";

export const githubRepoJsonRenderCatalog = defineCatalog(schema, {
  components: {
    ...layoutCatalogComponents,
    RepoName: {
      props: z.object({
        name: DynamicStringSchema,
      }),
      description: 'Repository name heading. Bind name with { "$state": "/name" }.',
    },
    RepoDescription: {
      props: z.object({
        description: z.union([DynamicStringSchema, z.null()]),
      }),
      description:
        'Repository description. Bind description with { "$state": "/description" }. Hidden when null/empty.',
    },
    RepoStars: {
      props: z.object({
        stargazers_count: DynamicNumberSchema,
      }),
      description:
        'Star count. Bind stargazers_count with { "$state": "/stargazers_count" }.',
    },
    RepoForks: {
      props: z.object({
        forks_count: DynamicNumberSchema,
      }),
      description:
        'Fork count. Bind forks_count with { "$state": "/forks_count" }. Hidden when zero.',
    },
    RepoLanguage: {
      props: z.object({
        language: z.union([DynamicStringSchema, z.null()]),
      }),
      description:
        'Primary language. Bind language with { "$state": "/language" }. Hidden when null.',
    },
  },
  actions: {},
});
