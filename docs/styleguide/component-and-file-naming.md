# Component and file naming

Use these rules for **repo-authored React components** that are **not** shadcn and **not** Next.js special files.

### Rule: PascalCase file name matches the component

- **Do** name the file in **PascalCase** when it exports a single React component.
- **Do** match the file name to the component name.

### Good vs bad: component file naming (PascalCase)

- **Bad**: file name doesn’t match component name
  - `components/home/portfolio-grid.tsx`
  - `export function PortfolioGrid() { ... }`

- **Good**: file name matches component name
  - `components/home/PortfolioGrid.tsx`
  - `export function PortfolioGrid() { ... }`

### Exceptions (this rule does not apply)

- **shadcn/ui components**: anything under `components/ui/**` keeps shadcn’s conventions.
- **Next.js special files**: framework-reserved files under `app/**` keep their required names (for example `page.tsx`, `layout.tsx`, `loading.tsx`, `error.tsx`, `not-found.tsx`, `route.ts`).

