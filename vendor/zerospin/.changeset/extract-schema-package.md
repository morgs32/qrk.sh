---
'@zerospin/schema': minor
'@zerospin/core': major
'@zerospin/cli': patch
'@zerospin/dev-worker': patch
'@zerospin/production-worker': patch
'@zerospin/react': patch
'@zerospin/sdk': patch
'@zerospin/shared-worker': patch
'system': patch
'system-worker': patch
---

Extract primitive descriptors, table definitions, row inference, ID factories,
and Effect and Drizzle schema mappings into the standalone `@zerospin/schema`
package. The moved modules are no longer exported from `@zerospin/core`; import
their public surface from the `@zerospin/schema` package root.
