<!-- Use a static Shields badge because pkg.pr.new's dynamic badge times out while counting this repository's releases. -->

[![pkg.pr.new](https://img.shields.io/badge/pkg.pr.new-Effect--TS%2Feffect-black)](https://pkg.pr.new/~/Effect-TS/effect)

# Effect

Effect is a library for building robust, maintainable, type-safe, and production grade applications in TypeScript.

> **Effect V4 is currently in beta.** The `main` branch contains v4 development.

## Zerospin subrepo metadata

This checkout is vendored from
[`Effect-TS/effect`](https://github.com/Effect-TS/effect) as a squashed Git
subtree.

- Upstream: `https://github.com/Effect-TS/effect.git`
- Branch: `main`

From the Zerospin repository root, occasionally pull upstream changes with:

```bash
git subtree pull --prefix=vendor/effect https://github.com/Effect-TS/effect.git main --squash
```

Publish local subtree changes upstream only after reviewing the split history
and confirming that you intend to contribute them to Effect:

```bash
git subtree push --prefix=vendor/effect https://github.com/Effect-TS/effect.git main
```

## Install V4 Beta

```sh
npm install effect@beta
```

## Effect v3

The Effect v3 source code is available on the [`v3`](https://github.com/Effect-TS/effect/tree/v3) branch.

```sh
npm install effect@latest
```

Issues and pull requests meant for Effect v3 should target the [`v3`](https://github.com/Effect-TS/effect/tree/v3) branch.

## Resources

- Documentation (https://effect.website)
- Discord (https://discord.gg/effect-ts)
- Effect v3 source (https://github.com/Effect-TS/effect/tree/v3)
- Effect v4 source (https://github.com/Effect-TS/effect/tree/main)

## License

MIT
