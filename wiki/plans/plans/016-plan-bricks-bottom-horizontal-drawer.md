# Bricks bottom horizontal drawer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the bricks sandbox always use a bottom non-modal drawer (open from the floating toolbar, close from a studio-style header X) and show the groups list as a horizontally scrollable filmstrip.

**Architecture:** Keep Vaul drawer chrome in `SandboxLayout`; drop the desktop left half-panel and half-width grid split. Convert `GroupsPage` to a CSS horizontal filmstrip of group columns. Update Playwright + styleguide docs that encode the old split layout.

**Tech Stack:** React Router workbench (`apps/library/app`), Vaul/shadcn drawer, Tailwind, Playwright (`pnpm nx run @qrk.sh/library:test:e2e` / package script `test:e2e`).

**Design spec:** `wiki/plans/specs/016-spec-bricks-bottom-horizontal-drawer.md`

## Global Constraints

- Always bottom drawer on all viewports; never restore the left half-panel.
- Open via floating toolbar **Bricks**; close via header control with `aria-label="Close drawer"`.
- Drawer remains non-modal (`modal={false}`) so grid DnD works while open.
- Filmstrip is `/` (`GroupsPage`) only; nested `/groups/...` routes stay full-width in the same `Outlet`.
- No Embla for groups; no changes to drag MIME, `DraggableBrick`, or catalog models.
- Edit live sources under `apps/library/app/**` and `docs/**` only. Do not author parallel fixes under `apps/library/src/**` (stale tree).
- Do not add new named types without asking; do not add `ALLOWED_CAST`.
- Prefer `pnpm nx run @qrk.sh/library:…` for verification.

## File structure

| File | Responsibility |
| --- | --- |
| `apps/library/app/routes/SandboxLayout.tsx` | Always-bottom drawer shell, header chrome, full-bleed grid, toolbar Bricks trigger |
| `apps/library/app/routes/GroupsPage.tsx` | Horizontal filmstrip of group columns |
| `apps/library/app/tests/grid-width.playwright.spec.ts` | Width presets + drawer open/close against full-bleed layout |
| `apps/library/app/tests/preview-dimensions.playwright.spec.ts` | Preview sizing without “Bricks panel” width hacks; filmstrip overflow |
| `docs/styleguide/component-and-file-naming.md` | Document always-bottom drawer + horizontal groups list |

No new components or files unless a task below explicitly creates one (none planned).

---

### Task 1: Rewrite Playwright expectations for always-bottom drawer + full-bleed grid

**Files:**
- Modify: `apps/library/app/tests/grid-width.playwright.spec.ts`
- Modify: `apps/library/app/tests/preview-dimensions.playwright.spec.ts` (only the `group previews scroll rather than shrinking` test)

**Interfaces:**
- Consumes: existing roles/labels (`dialog` name `Bricks`, toolbar `Grid controls`, `Brick grid`)
- Produces: failing tests that encode the new shell + close label + filmstrip overflow contract

- [ ] **Step 1: Replace `grid-width.playwright.spec.ts` with full-bleed + always-drawer expectations**

Replace the file contents with:

```ts
import { expect, test } from "@playwright/test";

test("limits presets to available width and preserves width through navigation and reset", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto("/");
  const grid = page.getByLabel("Brick grid");
  const toolbar = page.getByRole("toolbar", { name: "Grid controls" });
  const drawer = page.getByRole("dialog", { name: "Bricks", exact: true });

  await expect(grid).toHaveCSS("width", "1440px");
  await expect(toolbar.getByRole("button", { name: "Full", exact: true })).toHaveCount(0);
  await expect(toolbar.getByRole("button", { name: /^(768|1536)px grid width$/ })).toHaveCount(0);
  await expect(page.getByLabel("Bricks panel")).toHaveCount(0);
  await expect(toolbar.getByRole("button", { name: "Bricks", exact: true })).toBeVisible();
  await expect(drawer).not.toBeVisible();

  const toolbarBounds = await toolbar.boundingBox();
  expect(toolbarBounds?.y).toBeGreaterThan(800);
  expect(toolbarBounds?.x).toBeGreaterThanOrEqual(0);

  await toolbar.getByRole("button", { name: "375px grid width", exact: true }).click();
  await expect(grid).toHaveCSS("width", "375px");
  expect((await grid.boundingBox())?.x).toBeCloseTo((1600 - 375) / 2, 0);
  await expect(
    toolbar.getByRole("button", { name: "640px grid width", exact: true }),
  ).toBeEnabled();
  await expect(
    toolbar.getByRole("button", { name: "1024px grid width", exact: true }),
  ).toBeEnabled();

  await toolbar.getByRole("button", { name: "Bricks", exact: true }).click();
  await expect(drawer).toBeVisible();
  await drawer.locator('[data-group-link="swatch"]').click();
  await expect(page).toHaveURL(/groups\/swatch$/);
  await expect(grid).toHaveCSS("width", "375px");
  await toolbar.getByRole("button", { name: "Reset grid layout" }).click();
  await expect(grid.locator("[data-brick-id]")).toHaveCount(0);
  await expect(grid).toHaveCSS("width", "375px");
  await toolbar.getByRole("button", { name: "640px grid width", exact: true }).click();
  await expect(grid).toHaveCSS("width", "640px");
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(
    toolbar.getByRole("button", { name: "640px grid width", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(grid).toHaveCSS("width", "640px");
  await expect(
    toolbar.getByRole("button", { name: "1024px grid width", exact: true }),
  ).toBeEnabled();
  await toolbar.getByRole("button", { name: "375px grid width", exact: true }).click();
  await page.reload();
  await expect(grid).toHaveCSS("width", "375px");
});

test("all fixed presets measure exactly when the viewport fits them", async ({ page }) => {
  await page.setViewportSize({ width: 3000, height: 900 });
  await page.goto("/");
  for (const width of [375, 640, 1024, 1440]) {
    await page.getByRole("button", { name: `${width}px grid width`, exact: true }).click();
    await expect(page.getByLabel("Brick grid")).toHaveCSS("width", `${width}px`);
  }
  await page.reload();
  await expect(page.getByLabel("Brick grid")).toHaveCSS("width", "1440px");
});

for (const width of [375, 768, 1600]) {
  test(`toolbar and nonmodal half-height drawer at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    const toolbar = page.getByRole("toolbar", { name: "Grid controls" });
    const drawer = page.getByRole("dialog", { name: "Bricks", exact: true });
    await expect(drawer).not.toBeVisible();
    await expect(toolbar).toBeVisible();
    await expect(toolbar.getByRole("button", { name: "Bricks", exact: true })).toBeVisible();
    const bounds = await toolbar.boundingBox();
    expect(bounds?.x).toBeGreaterThanOrEqual(0);
    expect((bounds?.x ?? 0) + (bounds?.width ?? 0)).toBeLessThanOrEqual(width);
    await expect(page.getByLabel("Brick grid")).toBeVisible();
    await toolbar.getByRole("button", { name: "Bricks", exact: true }).click();
    await expect(drawer).toBeVisible();
    await expect(drawer).toHaveCSS("height", "450px");
    await expect(drawer).toHaveCSS("width", `${width}px`);
    await drawer
      .locator('[data-group-representative="icon/default"]')
      .dragTo(page.getByLabel("Brick grid").locator(".react-grid-layout"), {
        targetPosition: { x: 20, y: 20 },
      });
    await expect(
      page.getByLabel("Brick grid").locator('[data-brick="icon/default"]'),
    ).toBeVisible();
    await expect(drawer).toBeVisible();
    await drawer.locator('[data-group-link="swatch"]').click();
    await expect(page).toHaveURL(/groups\/swatch$/);
    await toolbar.getByRole("button", { name: "Reset grid layout" }).click();
    await expect(page.getByLabel("Brick grid").locator("[data-brick-id]")).toHaveCount(0);
    await drawer.getByRole("button", { name: "Close drawer" }).click();
    await expect(drawer).not.toBeVisible();
    await toolbar.getByRole("button", { name: "Bricks", exact: true }).click();
    await drawer.getByRole("button", { name: "Close drawer" }).focus();
    await page.keyboard.press("Escape");
    await expect(drawer).not.toBeVisible();
  });
}
```

Notes for implementers:
- At 1600px full-bleed, largest fitting preset is `1440` (was `640` when only half the viewport was available).
- Close control label is **`Close drawer`** (studio), not `Close bricks`.
- Desktop no longer has `aria-label="Bricks panel"`.

- [ ] **Step 2: Update the preview-dimensions scroll test**

In `apps/library/app/tests/preview-dimensions.playwright.spec.ts`, replace `group previews scroll rather than shrinking` with:

```ts
test("group filmstrip scrolls horizontally rather than shrinking previews", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto("/");
  const toolbar = page.getByRole("toolbar", { name: "Grid controls" });
  const drawer = page.getByRole("dialog", { name: "Bricks", exact: true });
  await toolbar.getByRole("button", { name: "Bricks", exact: true }).click();
  await expect(drawer).toBeVisible();

  const filmstrip = drawer.getByLabel("Brick groups");
  const github = filmstrip.locator('[data-group-entry="github"]');
  const preview = github.locator('[data-group-representative="github/profile"]');

  // Selected grid width at 1600 is 1440 → profile w=4 → 720px preview.
  await expect(preview).toHaveCSS("width", "720px");
  expect(
    await filmstrip.evaluate((element) => element.scrollWidth > element.clientWidth),
  ).toBe(true);
  expect(
    await github.evaluate((element) => element.getBoundingClientRect().width),
  ).toBeLessThan(720);
});
```

If local group catalog sizes differ and `720` is wrong, recompute from `BrickPreviewFrame`: `Math.round((selectedGridWidth / 8) * def[breakpoint].w)` for `github/profile` at the active preset — do not force a left-panel width.

- [ ] **Step 3: Run the focused Playwright files and confirm they fail for the right reasons**

Run:

```bash
pnpm nx run @qrk.sh/library:test:e2e -- app/tests/grid-width.playwright.spec.ts app/tests/preview-dimensions.playwright.spec.ts
```

If the Nx target does not forward file args, run from `apps/library`:

```bash
pnpm exec playwright test --config app/playwright.config.ts app/tests/grid-width.playwright.spec.ts app/tests/preview-dimensions.playwright.spec.ts
```

Expected: FAIL — still finds `Bricks panel`, close button still `Close bricks`, desktop still splits, filmstrip not horizontal / drawer not open on desktop by default path.

- [ ] **Step 4: Commit**

```bash
git add apps/library/app/tests/grid-width.playwright.spec.ts apps/library/app/tests/preview-dimensions.playwright.spec.ts
git commit -m "$(cat <<'EOF'
test(bricks): expect always-bottom drawer and horizontal filmstrip

EOF
)"
```

---

### Task 2: Always-bottom drawer shell in `SandboxLayout`

**Files:**
- Modify: `apps/library/app/routes/SandboxLayout.tsx`

**Interfaces:**
- Consumes: existing `Drawer*` from `apps/library/components/ui/drawer.tsx`, `drawerOpen` state
- Produces: full-bleed grid; toolbar always has Bricks; drawer header with `Close drawer`

- [ ] **Step 1: Remove desktop split state and always render `DrawerContent`**

In `SandboxLayout.tsx`:

1. Delete `isDesktop` state and the `matchMedia("(min-width: 1024px)")` listener (and its `setDrawerOpen(false)` on change). Keep only the `ResizeObserver` for `availableWidth`.
2. Delete the `isDesktop ? <section aria-label="Bricks panel">… : <DrawerContent>…` branch. Always render:

```tsx
<DrawerContent
  aria-describedby={undefined}
  className="qrk-bricks inset-x-0 bottom-0 z-60 h-[50dvh] rounded-t-lg border-t border-zinc-300 bg-white"
  onInteractOutside={(event) => event.preventDefault()}
  onOpenAutoFocus={(event) => event.preventDefault()}
>
  <DrawerTitle className="sr-only">Bricks</DrawerTitle>
  <div className="flex shrink-0 items-start justify-between gap-4 border-b border-border/60 px-4 py-3">
    <div className="space-y-1">
      <div className="text-sm font-semibold">Bricks</div>
      <div className="text-xs text-muted-foreground">
        Browse bricks by group. Drag a brick onto the grid.
      </div>
    </div>
    <DrawerClose asChild>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="cursor-pointer"
        aria-label="Close drawer"
      >
        <X aria-hidden />
      </Button>
    </DrawerClose>
  </div>
  <div className="min-h-0 flex-1 overflow-hidden">{groups}</div>
</DrawerContent>
```

3. Simplify the `groups` block: it no longer needs its own top “Brick groups” header chrome if the drawer header owns title/close. Keep the `Outlet` wrapper:

```tsx
const groups = (
  <div className="qrk-bricks flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden font-mono text-sm leading-5 text-zinc-900">
    <div data-vaul-no-drag className="min-h-0 flex-1 overflow-hidden">
      <Outlet />
    </div>
  </div>
);
```

(Remove the old inner `header` with `Link to="/"` labeled “Brick groups” from this shell — group navigation stays inside route content.)

4. Full-bleed grid region — change:

```tsx
className="relative min-w-0 pt-14 lg:ml-[50%] lg:w-1/2 lg:pt-0"
```

to:

```tsx
className="relative min-w-0 pt-14"
```

Also drop the decorative half-width white strip that assumed a right-half panel if it only existed for the split (`aria-hidden` `lg:w-1/2` sibling). Keep centering of the selected-width preview.

5. Toolbar: always show `DrawerTrigger` / Bricks (remove `{!isDesktop && (…)}`). Center over the full viewport — change toolbar wrapper from:

```tsx
className="pointer-events-none fixed inset-x-0 top-3 z-80 flex justify-center px-2 lg:bottom-6 lg:left-1/2 lg:top-auto"
```

to (keep top on small, bottom on large, but full width — no `lg:left-1/2`):

```tsx
className="pointer-events-none fixed inset-x-0 top-3 z-80 flex justify-center px-2 lg:bottom-6 lg:top-auto"
```

6. Keep `Drawer open={drawerOpen} onOpenChange={setDrawerOpen} modal={false}`.

- [ ] **Step 2: Run the grid-width Playwright file**

```bash
pnpm exec playwright test --config app/playwright.config.ts app/tests/grid-width.playwright.spec.ts
```

Working directory: `apps/library`.

Expected: PASS for shell/open/close/DnD/preset tests. Filmstrip-specific assertion in preview-dimensions may still fail until Task 3.

- [ ] **Step 3: Commit**

```bash
git add apps/library/app/routes/SandboxLayout.tsx
git commit -m "$(cat <<'EOF'
feat(bricks): use always-bottom bricks drawer on all viewports

EOF
)"
```

---

### Task 3: Horizontal filmstrip on `GroupsPage`

**Files:**
- Modify: `apps/library/app/routes/GroupsPage.tsx`

**Interfaces:**
- Consumes: unchanged `groupsHash`, `GroupOutline`, `DraggableBrick`, `BrickPreviewFrame`
- Produces: `aria-label="Brick groups"` element that is the horizontal scroller; each `[data-group-entry]` is a column

- [ ] **Step 1: Convert the groups list to a horizontal row of columns**

Replace the outer layout of `GroupsPage` so the labeled scroller is the filmstrip:

```tsx
return (
  <div
    aria-label="Brick groups"
    className="flex h-full min-h-0 flex-row gap-0 overflow-x-auto overflow-y-hidden overscroll-x-contain"
  >
    {groups.map((group) => {
      // … same catalog selection logic as today …

      return (
        <div
          key={group.id}
          data-group-entry={group.id}
          className="flex h-full min-h-0 w-max max-w-[min(100%,42rem)] shrink-0 flex-col overflow-y-auto overscroll-contain border-r border-zinc-200"
        >
          <Outline.Title sticky>
            <Link to={`/groups/${encodeURIComponent(group.id)}`} data-group-link={group.id}>
              {group.label}
            </Link>
          </Outline.Title>
          <GroupOutline
            group={group}
            renderCatalog={(catalogName, label) => (
              <Button
                variant="link"
                aria-pressed={selectedCatalogName === catalogName}
                onClick={() => {
                  setSelectedCatalogs((current) => ({
                    ...current,
                    [group.id]: catalogName,
                  }));
                }}
                className="h-auto rounded-none p-0 font-normal leading-inherit text-zinc-500 underline aria-pressed:text-zinc-950 aria-pressed:no-underline"
              >
                {label}
              </Button>
            )}
          />
          <div className="overflow-auto bg-white py-6">
            <div className={def[breakpoint].w === 8 ? undefined : "px-4"}>
              <BrickPreviewFrame w={def[breakpoint].w} h={def[breakpoint].h}>
                <DraggableBrick
                  brickDef={def}
                  className="size-full qrk-bricks overflow-hidden"
                  data-group-representative={`${def.groupId}/${def.catalogId}`}
                >
                  <div className="brick-drag-content size-full">
                    <BrickComponent breakpoint={breakpoint} data={def.data} />
                  </div>
                  <Button asChild variant="ghost" size="icon" className="brick-edit-handle">
                    <Link
                      aria-label="Configure catalog"
                      to={`/groups/${encodeURIComponent(def.groupId)}?catalog=${encodeURIComponent(def.catalogId)}`}
                    >
                      <Pencil aria-hidden className="size-4" />
                    </Link>
                  </Button>
                </DraggableBrick>
              </BrickPreviewFrame>
            </div>
          </div>
        </div>
      );
    })}
  </div>
);
```

Intent of column classes:
- `w-max` + `max-w-[min(100%,42rem)]` → column sized to content but capped so one group does not own the whole drawer; wide previews scroll inside the column’s `overflow-auto` preview region.
- Parent `overflow-x-auto` → filmstrip scrolls horizontally across groups.
- Keep all existing `data-*` hooks used by Playwright.

If the preview-dimensions assertion `column width < 720` fails because `w-max` expands to the preview width, tighten the column with an explicit width such as `w-[min(100%,20rem)]` and keep preview `overflow-auto` inside — prefer that fix over shrinking `BrickPreviewFrame`.

- [ ] **Step 2: Run both focused Playwright files**

```bash
pnpm exec playwright test --config app/playwright.config.ts app/tests/grid-width.playwright.spec.ts app/tests/preview-dimensions.playwright.spec.ts
```

Working directory: `apps/library`.

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/library/app/routes/GroupsPage.tsx
git commit -m "$(cat <<'EOF'
feat(bricks): make groups list a horizontal filmstrip in the drawer

EOF
)"
```

---

### Task 4: Update styleguide + regression sweep

**Files:**
- Modify: `docs/styleguide/component-and-file-naming.md` (section **Bricks sandbox grid width and toolbar**, ~lines 204–218)
- Verify: other Playwright under `apps/library/app/tests/` that open the drawer or assume a left panel

**Interfaces:**
- Consumes: shipped shell + filmstrip behavior
- Produces: docs aligned with implementation

- [ ] **Step 1: Rewrite the styleguide sandbox layout paragraph**

Replace the split-layout paragraph with:

```markdown
### Bricks sandbox grid width and toolbar

The sandbox uses the actual browser width for its surrounding layout. The grid
region is full-bleed. Bricks open in a half-height, nonmodal shadcn bottom drawer
on every viewport. The drawer leaves the grid interactive for drag/drop and
supports its header close button (`Close drawer`) and Escape. On `/`, brick
groups are laid out as a horizontally scrollable filmstrip of columns inside
the drawer; nested `/groups/...` routes still fill the drawer body.

The app-style toolbar sits at the bottom on large viewports and at the top on
smaller ones, centered over the full viewport, and always includes the Bricks
control. The 375, 640, 1024, and 1440px choices resize only the grid preview,
centered within the available width. Measure the available region independently
of the preview; disable choices that exceed it. Start with the largest fitting
preset and fall back to the largest fitting preset if a resize makes the
selection too large. Below 375px, hide the preview and show its minimum-width
requirement. Width selection lasts across sandbox route navigation and reload,
and is independent of Reset's grid state changes.
```

- [ ] **Step 2: Grep for stale assumptions and fix only what this change breaks**

```bash
rg -n "Bricks panel|Close bricks|lg:ml-\\[50%\\]|half-height drawer|left half" apps/library/app docs/styleguide
```

Update any remaining `apps/library/app/tests/**` hits that still require the left panel or `Close bricks`. Do not edit `apps/library/src/**`.

- [ ] **Step 3: Run the bricks e2e suite**

```bash
pnpm nx run @qrk.sh/library:test:e2e
```

Expected: PASS (or only pre-existing failures unrelated to drawer/filmstrip — report those; do not fix out of scope).

- [ ] **Step 4: Commit**

```bash
git add docs/styleguide/component-and-file-naming.md apps/library/app/tests
git commit -m "$(cat <<'EOF'
docs(bricks): document always-bottom drawer and horizontal filmstrip

EOF
)"
```

---

## Spec coverage checklist

| Spec requirement | Task |
| --- | --- |
| Always bottom drawer; remove left panel | Task 2 |
| Open from floating toolbar Bricks | Task 2 (+ Task 1 assertions) |
| Close via header `Close drawer` | Task 2 (+ Task 1) |
| Non-modal / DnD while open | Task 1 drag assertion + Task 2 `modal={false}` |
| ~50dvh full-width bottom | Task 2 classes + Task 1 height/width asserts |
| Full-bleed grid | Task 2 + Task 1 preset math |
| Horizontal filmstrip on `/` | Task 3 (+ Task 1 preview test) |
| Nested routes unchanged (full-width Outlet) | Task 2 `Outlet` / no GroupsPage change for nested |
| Playwright + styleguide updates | Tasks 1 and 4 |
| No Embla / no drag model changes | Global constraints |

## Self-review notes

- No TBD placeholders.
- Close label is consistently `Close drawer` in tests and UI.
- Preset expectations use full viewport width, not half.
- `apps/library/src/**` explicitly out of scope.
