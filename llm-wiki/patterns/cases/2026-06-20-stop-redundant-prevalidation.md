# Stop redundant prevalidation

## Smell

Same RPC props validated in the `ZerospinApis` capability factory and again in
SystemWorker or \*Repo DO.

## Pattern

See `apis/trust-boundary-validation-in-api-not-repo.ts`.

## When to apply

Adding `Schema.validate` to SystemWorker or a repo DO after the public \*Api
capability already decodes the wire shape.
