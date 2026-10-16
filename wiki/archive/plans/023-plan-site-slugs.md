# Site creation slugs

Status: Complete. Allocated 023 after a concurrent Article plan claimed 022.

## Problem and agreed behavior

1. Site creation currently submits a name without a slug. Add a Slug text input immediately below Name.
2. An empty field accepts its name-derived placeholder. Normalize the suggestion to lowercase ASCII kebab case, remove combining accents, and replace spaces/punctuation with single hyphens.
3. Check availability only among the current user's sites. For a taken suggestion, use the first available numbered suffix, starting at `-1`.
4. Custom input overrides the suggestion and must contain lowercase ASCII letters/digits separated by single internal hyphens. Reject invalid or taken custom input without rewriting it. Clearing it restores the suggestion.
5. Require custom input when the name produces no valid suggestion. Keep initial home-page creation and existing editor routes.
6. Use the approved fresh development cutover with an intact backend backup. No historical migration, slug editing, public URL changes, global uniqueness, or new availability endpoint.

## Decisions and rationale

1. The existing owner-filtered `user.sites` live query provides immediate feedback. The existing creation guard owns authoritative format and uniqueness decisions, including concurrent tabs.
2. Make the creation payload's slug required; keep the Site model nullable and existing V1 declaration versions. The development cutover avoids changing retained-history semantics or introducing compatibility lineage.
3. Number suggestions only: an explicitly typed slug is the user's choice and must remain unchanged.
4. Keep this behavior in the owning dashboard and creation contract. Add no named types, shared wrappers, dependencies, or module coupling.

## Implementation

1. Add form state, suggestion generation, inline feedback and submission checks to the existing dashboard. Include the selected slug in `createSite`; reset the two fields on Cancel/close/success.
2. Require `primitives.text()` in `createSite`. After authentication/ownership checks, validate with Effect Schema and reject invalid format with `site-slug-invalid` (400) or a matching `(userId, slug)` with `site-slug-taken` (409).
3. Subscribe to originating `createSite` admission/execution failures in the dashboard and unsubscribe with its lifetime. Immediate staging refusals retain form values and are shown once.
4. Update creation fixtures and add focused format/ownership uniqueness checks in the existing Workerd test seam.
5. Update affected READMEs, then verify before replacing active development state.

```ts
// 1. A taken suggestion advances through the user's occupied names.
while (suggestedSlug !== "" && usedSlugs.has(suggestedSlug)) {
  suggestedSlug = `${slugBase}-${suffix}`;
  suffix += 1;
}

// 2. An empty input accepts the available name-based suggestion.
const slug = siteSlug === "" ? suggestedSlug : siteSlug;
```

1. Example: `My Travels` suggests `my-travels`; occupied `my-travels` and `my-travels-1` produce `my-travels-2`.
2. Example: custom `another-trip` is accepted if available; `Another Trip` is rejected rather than converted.

Legend: `~` modify; `+` create.

```text
qrk.sh/
├── apps/studio/
│   ├── ~ app/[username]/(dashboard)/page.tsx
│   └── ~ README.md
├── apps/zerospin/
│   ├── ~ src/aggregates/user/contracts/createSite/CreateSiteV1.ts
│   ├── ~ src/siteContracts.workerd.spec.ts
│   └── ~ README.md
└── wiki/plans/
    └── + 023-plan-site-slugs.md
```

## Verification and cutover

1. Check valid persistence; missing/null/invalid slugs; same-owner duplicate rejection without writes; and another owner reusing a slug. Run backend Workerd checks plus Studio/backend typechecking and lint through Nx. Run no Library tests.
2. Stop backend development before moving the complete `.wrangler/zerospin/dev-worker/sys_qrk_sh_1` directory into `.wrangler/zerospin/backups/sys_qrk_sh_1-<UTC timestamp>-pre-site-slugs`. Restart normally and require system-spec acceptance; never use `--clean` for this cutover.
3. Verify in the existing Chrome profile/origin. The changed session-lock hash creates a fresh Node namespace; old browser databases and cookies remain intact.
4. Manually check generated/custom values, accent normalization, numbering, format/taken errors, Cancel/reset, reload persistence and availability updates across tabs.
5. After implementation reconcile terminology and decisions with the result. If the glossary is still absent, ask before creating one. Create an ADR only for an implemented choice that is hard to reverse, surprising without context, and a real trade-off; none is anticipated for this routine change. Archive only after required work is complete.

## Verification evidence

1. With the concurrent Zerospin 11.0.0 migration completed, `pnpm nx run-many -t ts lint -p @qrk.sh/studio @qrk.sh/zerospin --outputStyle=static` passed all four targets and the Library build dependency. No dependency exclusion was needed for the final checks.
2. `pnpm nx run @qrk.sh/zerospin:test:workerd --outputStyle=static -- src/siteContracts.workerd.spec.ts` passed all 9 tests and its build dependency. No Library tests were written or run.
3. In the existing authenticated Chrome profile at `http://localhost:3000/morgs32`, verified Name/Slug ordering; `Café & Trips` → `cafe-trips`; invalid custom input; clearing and Cancel/reset; default `my-travels`; numbered `my-travels-1`; taken-custom rejection; and the second tab's suggestion advancing live to `my-travels-2`.
4. Custom `trip-notes` saved unchanged for `Custom Travels`. Reload persistence passed. A read-only query of the authoritative aggregate SQLite database confirmed slugs `my-travels`, `my-travels-1`, and `trip-notes`, and three `home` pages. These three local verification sites remain in development data.
5. Active backend storage was already absent at startup. Existing backup `sys_qrk_sh_1-20261014T154556Z-pre-meowdown` and older backups remain untouched. Authenticated initialization and canonical writes succeeded against the fresh active state. Browser databases/cookies, Library backups, API R2, package registry and concurrent session migration edits were not reset or reverted.
6. READMEs document the implemented behavior. After explicit user authorization, [the glossary](../../glossary.md#site-slug) records the implemented Site slug definition. No ADR was warranted or created. Screenshot: `/tmp/qrk-site-slugs-preview.jpg`.

## Remaining work

None.
