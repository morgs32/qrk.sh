# 058 — Layout component views

**Status:** Ready for implementation.

Bind the five shared layout components through `makeComponentView` and delete the handwritten prop parsers. Zerospin keeps the catalog metadata. App keeps the React. Saved specs that already pass `gap: 2` or `gap: 4` keep rendering.

## Behavior

1. `BrickShell`, `BrickBody`, `BrickFooter`, `Column`, and `Row` decode spec props with the same `makeComponentView` path as every other component. Invalid props throw. They do not clamp, drop, or substitute a fallback.
2. An absent nullable prop decodes as `null`. Column and Row specs that pass only `gap` still render. A missing non-nullable prop still fails. A nullable prop that already has `defaultValue` keeps that default; Article `content` stays null when omitted.
3. `gap` stays a number in metadata and in specs. Column and Row throw when it is not `2` or `4`. They no longer paint every other integer as gap 2. Authored JSX keeps `gap={2}` and `gap={4}`.
4. A null flex value or `className` means unset. Column and Row pass `undefined` into the existing CSS props. Shell, body, and footer still forward children only.
5. GitHub Profile, GitHub Repo, and GitHub Activity keep their registry override that wraps `BrickShell` with `bg-white`. That class is authored React, not a catalog prop.

```tsx
// 1. Nullable keys the spec omitted become null. Defaults and extra keys stay put.
const filled = { ...(typeof props === "object" && props !== null ? props : {}) };
mapValues(propsShape, (descriptor, key) => {
  const hasDefault = "defaultValue" in descriptor && descriptor.defaultValue !== undefined;
  if (descriptor.nullable === true && !hasDefault && filled[key] === undefined) {
    filled[key] = null;
  }
});
const decoded = decodeProps(filled, { onExcessProperty: "error" });

// 2. The closed gap set is the renderer's, because Zerospin enums are strings.
if (gap !== 2 && gap !== 4) {
  throw new Error("Column gap must be 2 or 4.");
}

// 3. Null from the decoder is unset CSS, not a flex keyword.
<Column gap={gap} justifyContent={justifyContent ?? undefined} />
```

1. A GitHub Profile spec whose Column props are `{ gap: 2 }` renders `gap-2`. Its footer Row with `gap: 2`, `justifyContent: "flex-end"`, and `className: "w-full"` stays right-aligned.
2. A Column prop `gap: 8` throws during registry render. It does not become `gap-2`.
3. A Row prop `justifyContent: "stretch"` throws, because that value is not in the Row enum. Omitting `justifyContent` does not throw and does not set the style.

## Decisions

1. Use `makeComponentView` as the only spec-prop decoder for these five components. The shared `layoutRegistryComponents` object remains, and its values become each view's `RegistryComponent`. Nine registries already spread that object.
2. Fill absent nullable props inside `makeComponentView` before decode. The catalog already treats `nullable: true` as optional, while the Effect struct requires the key. Doing this once fixes Column and Row and matches Bio, Location, and the other nullable text props. Do not add a helper, a second schema, or a layout-only decoder.
3. Keep `gap` as `primitives.integer()`. Zerospin `primitives.enum` accepts only strings, and `compileDescriptor` rejects anything else. Encoding gap as `"2" | "4"` would hide that limit and reject saved numeric specs. Do not change the sibling Zerospin checkout. The `2 | 4` throw stays in the Column and Row view functions until a numeric literal exists upstream.
4. Leave [`Column`](../../apps/bricks/src/components/Column.tsx) and [`Row`](../../apps/bricks/src/components/Row.tsx) as the CSS components. Their `gap: 2 | 4` prop type stays. The view narrows with the throw, then passes the value through. Authored call sites in the GitHub Profile and GitHub Repo module views are not spec props.
5. Do not add a Zerospin layout registry, a shared key map, or a linker. Component type names already join the metadata to the registry.
6. No migration and no local data reset. A saved spec whose gap is already 2 or 4 keeps working. Any other integer fails closed.

## Implementation

1. In [`makeComponentView.tsx`](../../apps/bricks/src/modules/react/makeComponentView.tsx), copy the incoming props and use `mapValues` over `propsShape` to set `null` for an absent nullable key that has no `defaultValue`. Decode that object with the existing `onExcessProperty: "error"` option. Destructure `context` before doing anything else. Keep `RegistryComponent` and `Component` as the stable identities returned today.
2. Replace the parsers in [`layoutRegistryComponents.tsx`](../../apps/bricks/src/modules/react/layoutRegistryComponents.tsx) with five `makeComponentView` bindings against the existing metadata exports. Delete `gapFromProps`, `stringProp`, `justifyContentProp`, `alignItemsProp`, and `flexWrapProp`. Each view function destructures `props` as its first statement.
3. Column and Row throw with a fixed message when `gap` is not `2` or `4`, then render the existing components. Convert null `justifyContent`, `alignItems`, `flexWrap`, and Row `className` with `?? undefined`. BrickShell, BrickBody, and BrickFooter render the existing components with `children` only.
4. Export the same `layoutRegistryComponents` object, with each key pointing at that view's `RegistryComponent`. Do not edit the nine registry files or the three GitHub `BrickShell` overrides.
5. After verification, repair the live source link for this registry in [the brick card research note](../research/page-brick-card-styling.md). The glossary has no term for this binding. Do not add one, and do not write an ADR: this removes an exception to the existing component-view rule, and the numeric gap limit is an upstream primitive gap rather than a QRK trade-off.

```tsx
export const columnView = makeComponentView(columnComponentMetadata, {
  component(props) {
    const { children, gap, justifyContent, alignItems, flexWrap } = props;
    if (gap !== 2 && gap !== 4) {
      throw new Error("Column gap must be 2 or 4.");
    }
    return (
      <Column
        gap={gap}
        justifyContent={justifyContent ?? undefined}
        alignItems={alignItems ?? undefined}
        flexWrap={flexWrap ?? undefined}
      >
        {children}
      </Column>
    );
  },
});

export const layoutRegistryComponents = {
  BrickShell: brickShellView.RegistryComponent,
  BrickBody: brickBodyView.RegistryComponent,
  BrickFooter: brickFooterView.RegistryComponent,
  Column: columnView.RegistryComponent,
  Row: rowView.RegistryComponent,
};
```

## Verification

1. Typecheck App through Nx. The Column and Row views must accept the decoded metadata props without a cast.
2. Sign in through the existing App dev URL and render a GitHub Profile brick and a GitHub Repo brick. Profile shows a `gap-2` column and a right-aligned footer row. Repo shows a `gap-4` footer row. Reloading keeps both.
3. There is no existing `makeComponentView` test seam. Do not add a harness. The typecheck and those two bricks cover the nullable omission and the legal gaps.

## Planned files

`+` creates a file. `~` modifies a file.

```text
qrk.sh/
├── apps/app/modules/
│   ├── make/
│   │   └── ~ makeComponentView.tsx
│   └── jsonRender/
│       └── ~ layoutRegistryComponents.tsx
└── wiki/research/
    └── ~ page-brick-card-styling.md
```
