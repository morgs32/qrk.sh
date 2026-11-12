# Brick drawer categories

## Goal

Let editors filter the Brick drawer by a single category while keeping the
filter controls visible above the scrolling previews.

## Decisions

1. Categories are UI-side catalog metadata. Each Brick view owns its category
   IDs. Definitions and backend declarations do not change.
2. The ordered categories are New, Social, Music, Business, and Tools. New is
   assigned manually. Categories with no Bricks are hidden.
3. All is the default. One filter is selected at a time; buttons wrap on narrow
   drawers and the selected filter lives only as long as the drawer is mounted.
4. Initial assignments are:
   1. New: Behance, Buy Me a Coffee.
   2. Social: Instagram, Behance, GitHub Profile.
   3. Music: none.
   4. Business: Buy Me a Coffee, Map Place, Link.
   5. Tools: Swatch and Icon, GitHub Activity, GitHub Repo, GitHub Profile,
      Figma Thumbnail, Image, Article, Link.

For example, Behance belongs to two categories:

```tsx
// The drawer shows this view in either selected category.
categoryIds: ["new", "social"],
```

## Implementation

1. Define the categories in the Bricks UI-side catalog, expose them to the App,
   and add required, inferred `categoryIds` to the view factory and contract.
2. Assign the agreed categories to the twelve existing views.
3. Use Bricks Buttons for the filter controls, expose selection with
   `aria-pressed`, and filter the existing registry-ordered previews.
4. Reconcile the glossary after implementation. Create an ADR only if the
   implemented decision is hard to reverse, surprising, and a real trade-off.
5. Run the App build through Nx and check formatting of changed files. The user
   will manually verify the filters, wrapping, scroll behavior, drag and insert.

## Planned files

`+` creates a file; `~` modifies a file.

```text
qrk.sh/
├── apps/bricks/package.json                                  ~
├── apps/bricks/src/modules/react/categories.ts               +
├── apps/bricks/src/modules/react/{makeModuleView.tsx,types.ts} ~
├── apps/bricks/src/modules/{article,behance,buyMeACoffee,
│   figmaThumbnail,githubActivity,githubProfile,githubRepo,
│   image,instagram,mapPlace,swatchAndIcon}/react/*View.tsx    ~
├── apps/bricks/src/modules/link/react/Link.stories.tsx         ~
├── apps/app/modules/link/linkView.tsx                        ~
├── apps/app/app/[username]/site/[siteId]/page/[pageId]/
│   Modules/ModuleFilmstrip.tsx                               ~
├── apps/app/README.md                                        ~
├── apps/web/library/WallViewer.stories.tsx                    ~
├── wiki/glossary.md                                          ~
└── wiki/archive/plans/080-plan-brick-drawer-categories.md    +
```

## Outcome

The agreed categories, view assignments, and drawer filters are implemented.
The App Nx build and Bricks import check passed. TypeScript checks passed for
App, Bricks, and Web. Scoped formatting passed for the new and changed Bricks
files and the drawer. The App Link view and Web story have pre-existing
formatting differences outside the added category lines. `git diff --check`
passed. The user performs visual, drag, and insertion verification separately,
per the daily choice in AGENTS.md. No ADR was warranted for this reversible
catalog grouping.

## Remaining work

None.
