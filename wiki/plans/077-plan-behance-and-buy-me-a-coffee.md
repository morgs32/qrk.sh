# 077 · Behance and Buy Me a Coffee Bricks

Add two module choices to Studio. Behance showcases selected projects from a public portfolio. Buy Me a Coffee gives visitors a direct link to the creator's hosted support page.

## 1. Verify Behance import

1. Trial `tortuga/behance-scraper` through Apify using QRK's existing server-side credential. Its current public API schema accepts a profile URL and its documentation shows profile rows and project rows with cover URLs. QRK's active Instagram lookup already calls Apify through Bricks API. The existing Instagram Actor is specific to Instagram. [Actor documentation](https://apify.com/tortuga/behance-scraper), [current input schema](https://api.apify.com/v2/acts/tortuga~behance-scraper/builds/default/openapi.json), [Instagram integration](../../apps/bricks/worker/instagram/getInstagramProfile.ts).
2. The live trial passed on 2026-11-11 using the local QRK Apify credential and Actor build `0.1.4`. Each run returned one matching profile and 11 projects with unique numeric IDs, nonempty titles, valid Behance gallery URLs, and matching ownership. Apify reported `usageTotalUsd: 0` for both runs.
   1. Graphéine returned its dataset in 6.53 seconds. A sample project was Marraud Group. [Apify run](https://console.apify.com/view/runs/oaKHH9tZCofV2M1Ys), [sample project](https://www.behance.net/gallery/258296801/Marraud-Group).
   2. Hey studio returned its dataset in 8.52 seconds, including four co-owned projects. A sample project was Let it Blow! [Apify run](https://console.apify.com/view/runs/EGlTmj1Eg3CUmHyRH), [sample project](https://www.behance.net/gallery/74910125/Let-it-Blow).
3. All 22 cover URLs returned HTTP 200 with recognizable JPEG or PNG bytes on unauthenticated GETs. One JPEG used the `image/jpg` content type. Behance oEmbed returned HTTP 200 for one project from each portfolio. It appended the creator name to the Graphéine sample title. The live trial exercised Apify directly and checked the public asset URLs. It did not exercise the future Bricks API integration or Studio.
4. Use automatic Behance import in the implementation. Decode the Actor's `person` and `project` rows and normalize numeric project IDs to strings when building the Brick snapshot. The trial returned 11 project candidates under the 12-item per-source cap, so the editor should accept a shorter list. Direct project page fetching returned HTTP 403 for a sample. [Behance sharing and embedding guide](https://help.behance.net/hc/en-us/articles/19288565618971-Guide-Sharing-and-Embedding-Behance-Content).

```ts
// Use one canonical profile URL. Cap both the portfolio lookup and total rows.
{
  startUrls: [{ url: "https://www.behance.net/grapheine" }],
  includeProfileProjects: true,
  includeDetails: false,
  maxItemsPerSource: 12,
  maxItems: 13,
}
```

## 2. Behance

1. Add `behance` to the Brick catalog. A drop creates an unconfigured Brick. In its sidebar form, accept an HTTPS Behance profile URL and provide **Import projects**. Normalize the documented profile host aliases to `https://www.behance.net/<username>` and remove tracking and fragment text. Reject non-profile paths and URLs on unrelated hosts.
2. Expose one Behance-specific lookup on Bricks API. Keep URL normalization, provider requests, and decoding inside the Behance module. Decode a matching public profile and only its public projects. Match projects by ownership, deduplicate by project ID, and return at most twelve candidates with the profile name and project titles, URLs, and covers. Use a bounded timeout. Send the validated draft to the existing Brick update command on Save, following the current lookup-then-save flow.
3. Show candidates in returned order. Preselect the first four on initial import and let the editor choose up to four. On reimport of the same profile, retain the intersection of saved IDs and returned candidates as the initial selection. On a different profile, start with the first four from the new result. Keep the existing Brick until Save succeeds. A public profile with zero eligible projects can be saved as a profile card. An unavailable profile or failed import leaves the last saved card in place and offers a retry. A result from an older request cannot replace the current draft.
4. Save the canonical profile URL, display name, and selected project snapshots in display order. Store each selected project's ID, title, canonical project URL, and validated HTTPS cover URL. Render the cover and title as one link to the project, plus a **View on Behance** profile link. Use a text tile when a previously saved cover fails to load. Rendering uses the saved snapshot so provider availability affects import, not the rest of the card.

```ts
{
  payload: { url: "https://www.behance.net/example" },
  data: {
    displayName: "Example Studio",
    // Only the chosen projects go into the Brick and publishing snapshot.
    projects: [{
      id: "123456789",
      title: "Studio identity",
      url: "https://www.behance.net/gallery/123456789/Studio-Identity",
      coverUrl: "https://mir-s3-cdn-cf.behance.net/projects/808/example.jpg",
    }],
  },
}
```

## 3. Buy Me a Coffee

1. Add `buy-me-a-coffee` to the catalog. A drop creates an unconfigured Brick. The sidebar accepts a creator page URL and an optional short support message. Save a canonical HTTPS `buymeacoffee.com/<creator>` URL and the message through the existing Brick update command. Use the module state schema for provider host and path validation. Reject lookalike domains and non-creator paths. The form requires no provider lookup.
2. Render an original coffee illustration, the message when supplied, and a **Buy Me a Coffee** link to the hosted creator page. Use the existing Brick link behavior. Buy Me a Coffee handles checkout. [Website button guide](https://help.buymeacoffee.com/en/articles/10206530-creative-ways-to-share-your-buy-me-a-coffee-page).

## 4. Register and verify

1. Each module owns its V1 definition, schema, default JSON Render spec, view, form, placeholder, and fixtures. Add a `264 × 168` Storybook SVG at the top of each module's configured and unconfigured stories. Wire both through the Bricks library and App view registry.
2. Widen the Brick module ID enum through Brick V3 and the publishing snapshot through Page Snapshot V5. Preserve the prior wire format for historical snapshots and retain both existing row-sizing branches. Advance only the contract declarations that require new model, operation, payload, or external bindings. Follow the exact bindings through the User V12 candidate, actor, App session, and snapshot consumers. Preserve all System registrations and the existing canonical selection. Give the user candidate and replay evidence before the user handwrites any promotion. Validate publication through snapshot creation and the existing Wall Viewer fixture. Public page routing and retrieval are separate.
3. Run the focused Bricks API provider checks with mocked results, including wrong profile, timeout, zero projects, and project deduplication. Verify a successful add and save for each module on the candidate, rejection of invalid state, old Brick and snapshot history replay, and snapshot creation with the new IDs. Run the affected Nx checks and both Storybook builds.
4. For the manual pass, add both modules in Studio, configure and reload them, check Behance selection and failed reimport, and verify both outgoing destinations without making a payment. Check the story illustrations and links at the narrow and wide breakpoints. Reconcile the module documentation and glossary after implementation, and evaluate whether an ADR is warranted.

```text
qrk.sh/
├── apps/bricks/
│   ├── + src/modules/{behance,buyMeACoffee}/
│   ├── + worker/behance/
│   └── ~ module exports, library, and Bricks API
├── apps/app/
│   └── ~ module registry, session, and snapshot consumers
├── apps/web/
│   └── ~ Wall Viewer snapshot fixture and types
└── apps/zerospin/
    └── + Brick and snapshot versions, affected contract versions, and User candidate
```

`+` adds files or modules. `~` updates existing wiring.

## Implementation evidence

1. The Behance Worker lookup decoded 11 projects for Hey studio in 5.63 seconds
   against live Apify. Seven mocked checks covered normalization, co-owner
   matching, deduplication, empty and wrong profiles, rate limits, and timeouts.
2. The candidate test uses the registered User V12 release. It creates and
   saves both Bricks, rejects invalid provider URLs, and publishes a Page snapshot
   containing both saved states. It also checks old add and publish payload
   adaptation and decodes a legacy-layout snapshot with the V4 schema.
3. Both modules render with their default specs and unconfigured placeholders.
   The Web Wall Viewer includes a V5 portfolio snapshot story. The Bricks,
   App, and Web Storybooks, API dry-run build, App build, and Zerospin test
   target passed.

## Remaining work

1. Verify retained-history replay for existing User instances before promotion.
   The candidate harness verified command adaptation and snapshot compatibility.
2. The user owns the manual Studio and Storybook pass. Saving the new module
   IDs through canonical execution requires the user's handwritten promotion.
