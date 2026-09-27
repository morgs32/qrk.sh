# Declaration casing

Use camelCase for models, contracts, actors, sessions, systems, and ordinary
functions and variables outside the exceptions below. Name their modules
and primary-export directories in camelCase too; matching tests follow the module
name. For example, `checkoutActorV3` belongs in `checkoutActorV3.ts`.

Keep PascalCase for classes and class-valued factories, including Durable Objects
and Effect service tags. Preserve PascalCase for React contexts and every JSX tag
reference, including components and objects used in member tags such as
`<Shopper.Provider>` and `<SidebarContext.Provider>`. Their corresponding modules
also retain PascalCase. This rule concerns tag names, not values passed as props.
Leave constant casing unchanged, including `SCREAMING_SNAKE_CASE`. Preserve
existing casing for schema values, Effect layers, and state-machine state
declarations, including their module filenames: for example,
`ExecutionDeltaSchema`, `AsyncLive`, and `Reconcile`. Name domain type aliases
and interfaces with an `I` prefix
([type aliases use I](type-aliases-use-i-prefix.ts)). Preserve enum and generic
parameter naming conventions.

Follow third-party and framework-required names at external boundaries. A local
rename must not change wire keys, stored keys, identity strings, or object keys:
expand shorthand properties when needed. Update imports, public exports, module
paths, templates, tests, and documentation together, without compatibility aliases.
