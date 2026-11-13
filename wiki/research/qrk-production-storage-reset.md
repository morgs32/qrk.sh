# QRK production storage reset

**Status:** Historical research. A temporary maintenance version was later promoted; the reset request was interrupted without a confirmed result. The user canceled the production cutover and will handle the Worker separately. See the [plan's cutover record](../archive/plans/089-plan-text-brick.md#production-inventory--2026-11-13).

## Findings

1. QRK configures the Zerospin System ID `sys_qrk_sh_1` in [`zerospin.config.ts`](../../apps/zerospin/zerospin.config.ts). Zerospin addresses its singleton SystemRepo by that System ID and acquires the `SYSTEM_REPO` namespace by name. [SystemRepo naming](../../../zerospin/packages/system-worker/src/SystemRepo/systemRepoName.ts), [repo registration](../../../zerospin/packages/system-worker/src/SystemRepo/registerRepo/registerRepoWithSystem.ts).
2. A read-only deployment and object inventory on 2026-11-13 found Worker `qrk-zerospin` at deployment `00fb42fb-8795-4be5-8881-c6f4dd8829f8`, serving version `e807836b-b6a7-4484-9d1a-1cf0e3097ce1` at 100%. Full cursor pagination found one stored object in its bound `SYSTEM_REPO` namespace `395991eff721400488bbf1d674db32e2`: object ID `bf0c9945d59b152c462120c097f4167b9ac8d7abc6701c9102a6382f8a23c5fd`. The other 20 bound namespaces returned no objects. Read-only Cloudflare GraphQL analytics returned the same namespace and object ID with name `sys_qrk_sh_1`, confirming their association without invoking the object; the historical sampled row showed 57 estimated requests since October 14. Analytics are subject to sampling and ingestion delay and do not prove present storage or the absence of older unbound data. [Cloudflare Durable Object metrics](https://developers.cloudflare.com/durable-objects/observability/metrics-and-analytics/), [dated inventory](../archive/plans/089-plan-text-brick.md#production-inventory--2026-11-13). Reinspect the live bindings and all object-list pages immediately before any reset.
3. Cloudflare's per-object `ctx.storage.deleteAll()` clears that object's SQLite SQL and KV data atomically. For compatibility dates before 2026-02-24, delete the alarm separately; on newer dates `deleteAll()` includes it. This API must execute inside the relevant Durable Object. Dropping application tables alone can leave internal metadata. [SQLite storage API](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/#deleteall), [storage cleanup guidance](https://developers.cloudflare.com/durable-objects/best-practices/rules-of-durable-objects/#clean-up-storage-with-deleteall).
4. Cloudflare also supports deleting an entire Durable Object class and namespace through a Worker deployment. This permanently deletes **all objects and their data** in that class, not a single named System. Its documented workflow removes the class and binding before a delete migration or deleted export; recreation needs a subsequent deployment and careful binding coordination. An external Worker may also depend on the namespace. It is a broader operation than a per-object reset. [Legacy class migrations](https://developers.cloudflare.com/durable-objects/reference/durable-object-class-migrations-legacy/), [class exports](https://developers.cloudflare.com/durable-objects/reference/durable-objects-migrations/).
5. No existing supported production reset method has been identified in QRK's Zerospin SystemRepo. A per-object reset therefore requires a reviewed way to run `deleteAll()` inside the targeted object, as well as a plan to prevent the incumbent Worker or clients from immediately reinitializing it with the old state. A class deletion/recreation also requires coordinated deployments. Neither operation was performed or authorized by this research.
6. The deployed Worker bundle's SystemRepo activation path can migrate the accepted SystemSpec when configured. [Data Studio](https://developers.cloudflare.com/durable-objects/observability/data-studio/) accesses the running object, so even a SQL `SELECT` could activate code with side effects. The active configuration has not been established, and no production SQL query was issued. The list-objects API itself reports opaque IDs and stored-data flags rather than application identity. [List Objects API](https://developers.cloudflare.com/api/resources/durable_objects/subresources/namespaces/subresources/objects/methods/list/).
7. QRK's API Worker separately declares R2 buckets `qrksh` and `assets`, and other Durable Object bindings. They are not the SystemRepo namespace and are outside this proposed reset. Clerk accounts, credentials, browser state, R2 uploads, and unrelated services also require separate treatment. [API Worker configuration](../../apps/api/wrangler.jsonc).

The analytics association was obtained from Cloudflare GraphQL with the QRK account tag and namespace ID supplied as variables; the request count is sampled/estimated:

```graphql
query($account: String!, $namespace: String!) {
  viewer {
    accounts(filter: {accountTag: $account}) {
      durableObjectsInvocationsAdaptiveGroups(
        filter: {date_geq: "2026-10-14", namespaceId: $namespace}
        limit: 1000
      ) {
        dimensions { namespaceId name objectId }
        sum { requests }
      }
    }
  }
}
```

## Open questions before execution

- Reconfirm the live namespace bindings and stored-object inventory immediately before executing a reset, including other relevant and historical namespaces. The read-only analytics association above establishes the current named SystemRepo's object ID without invoking it.
- Select and review the exact reset and deployment sequence; identify the handling of other namespaces, concurrent writers, browser journals, and initialization with the fresh declaration graph. List exact affected resources and obtain confirmation immediately before the destructive operation.
- Verify the post-cutover local, live, and production outcomes separately. Namespace inventory alone does not establish a successful publication or browser synchronization.
