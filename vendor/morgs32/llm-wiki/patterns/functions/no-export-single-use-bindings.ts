declare function makeActorApi<QUERIES>(props: QUERIES): QUERIES;
declare function makeActorController<CONFIG>(props: CONFIG): CONFIG;
declare const getProducts: { paramsSchema: unknown; query: unknown };

/**
 * Do not export a binding that is only consumed in the same module — inline it.
 *
 * @bad `export const actorApi = makeActorApi(...); export const actor = makeActorController({ api: actorApi })` when `actorApi` has no other importers.
 */
export const actor = makeActorController({
  name: 'shopper',
  api: makeActorApi({
    getProducts,
  }),
});
