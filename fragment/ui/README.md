# Fragment UI

Shared fonts, light/dark colors, nested outlines, and controls for Fragment and
Studio.

Import the stylesheet once, then wrap the UI in `FragmentAppearance`:

```tsx
import { FragmentAppearance } from '@zerospin/fragment-ui/FragmentAppearance';
import { Outline, OutlineItem } from '@zerospin/fragment-ui/Outline';
import '@zerospin/fragment-ui/styles.css';

<FragmentAppearance theme="light">
  <Outline>
    <OutlineItem label="Guides">
      <Outline>
        <OutlineItem label={<a href="/guides/quickstart">Quickstart</a>}>
          <Outline muted>
            <OutlineItem label={<a href="#installation">Installation</a>} />
          </Outline>
        </OutlineItem>
      </Outline>
      <p role="status">Loading more guides...</p>
    </OutlineItem>
  </Outline>
</FragmentAppearance>;
```

For a document-wide appearance, set `className="fragment-appearance"` and
`data-theme="light"` or `data-theme="dark"` on the root HTML element instead.

Callers own theme selection and persistence, labels, links, data, and nesting.
Outlines render semantic ordered lists with caller-supplied labels and no visible
automatic numbering. Standard element props and React 19 refs pass through.

Use `label` for the first line and `children` for the body. `OutlineItem` supplies
the private body wrapper; render nested outlines, controls, and shared feedback
directly as children. A body containing a direct nested `Outline` is indented by
`2ch`, including sibling feedback and controls. The nested list adds no separate
horizontal indent. Bodies containing only controls stay aligned with their
labels. Absent or boolean children omit the body; valid content such as `0`
still renders.

`Combobox` provides a searchable single-value control backed by Base UI:

```tsx
import { useRef } from 'react';
import { Combobox } from '@zerospin/fragment-ui/Combobox';
import { FragmentAppearance } from '@zerospin/fragment-ui/FragmentAppearance';

function RolePicker() {
  const appearanceRef = useRef<HTMLDivElement>(null);

  return (
    <FragmentAppearance ref={appearanceRef} theme="light">
      <Combobox
        label="Role"
        options={[
          { value: 'admin', label: 'Admin' },
          { value: 'reader', label: 'Reader' },
        ]}
        defaultValue="admin"
        portalContainer={appearanceRef}
      />
    </FragmentAppearance>
  );
}
```

Each option has a string value and label and can be disabled. The component
supports Base UI's controlled and uncontrolled selection, query, and popup props
and cancellation callbacks. Selected labels are selected on focus so typing can
replace them. The default empty message is `No results`; callers can set
`emptyLabel` for domain-specific text.

`Dropdown` provides a Base UI action menu with a text trigger:

```tsx
import { Dropdown } from '@zerospin/fragment-ui/Dropdown';

<Dropdown
  label="Theme: Light"
  items={[
    { id: 'light', label: 'Light', onClick: () => setTheme('light') },
    { id: 'dark', label: 'Dark', onClick: () => setTheme('dark') },
    { id: 'system', label: 'System', onClick: () => setTheme('system') },
  ]}
  portalContainer={appearanceRef}
/>;
```

Each item has an ID, label, click callback, and optional disabled state. Callers
own the selected value and trigger label. The menu supports controlled and
uncontrolled opening through `open`, `defaultOpen`, and `onOpenChange`.

Both controls render their popup in a portal. Pass the appearance element or its
React ref as `portalContainer` when `FragmentAppearance` wraps only part of the
document, so the popup inherits the same fonts and theme. The shared
`@zerospin/fragment-ui/styles.css` stylesheet includes both controls' styles;
consumers do not need a separate control stylesheet import.

Build with `pnpm nx run @zerospin/fragment-ui:lib`. The published package includes
its stylesheet and both font assets; it has no router dependency.
