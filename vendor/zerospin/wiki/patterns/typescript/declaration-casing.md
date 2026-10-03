# Declaration casing

Use camelCase for models, contracts, actors, sessions, systems, and ordinary
functions and variables outside the exceptions below. Name their modules
and primary-export directories in camelCase too; matching tests follow the module
name. For example, `checkoutActorV3` belongs in `checkoutActorV3.ts`.

Follow third-party and framework-required names at external boundaries. A local
rename must not change wire keys, stored keys, identity strings, or object keys:
expand shorthand properties when needed. Update imports, public exports, module
paths, templates, tests, and documentation together, without compatibility aliases.
