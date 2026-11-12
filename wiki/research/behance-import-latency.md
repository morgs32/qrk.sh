# Behance import latency

Researched 2026-11-11. Plan 077 recorded **6.53 s** and **8.52 s** for two direct Apify dataset requests and **5.63 s** for a live Bricks Worker lookup. Each returned 11 projects. The full Studio import remains untimed. [Plan 077](../plans/077-plan-behance-and-buy-me-a-coffee.md).

## Direct profile requests

Unauthenticated Python GETs with a generic Mozilla user agent returned HTTP 200 for three concurrent requests per profile. Wall-clock time includes the full response body through download and excludes parsing.

- **Graphéine** returned in **0.162 s, 0.175 s, and 0.210 s**. An earlier separate request took **1.053 s**. [Public profile](https://www.behance.net/grapheine).
- **Hey studio** returned in **0.669 s, 0.688 s, and 0.679 s**. [Public profile](https://www.behance.net/Hey_studio).

Each raw profile HTML response contained 12 unique gallery links and 12 titled project cover images hosted on Behance’s CDN. The probes counted links and images independently. Individual title/link/cover matches and co-owner membership still need verification. Both pages provided one profile preview via `og:title` and `og:image`. The project data was in the page body. [Graphéine profile](https://www.behance.net/grapheine), [Hey studio profile](https://www.behance.net/Hey_studio), [Open Graph protocol](https://ogp.me/).

## Embeds and official access

- Behance’s `/services/oembed` endpoint returned HTTP 200 for the two profile URLs in **0.203 s** and **0.173 s**. Both returned `type: user`, a name, and a profile thumbnail. Both lacked a project list and an `html` field. Requests for Marraud Group and Let it Blow! took **0.185 s** and **0.216 s**. Both returned `type: rich`, a title, and an iframe pointing to `/embed/project/<id>`. Both lacked `thumbnail_url`. [Endpoint reference](https://oembed.org/providers/behance), [Marraud Group](https://www.behance.net/gallery/258296801/Marraud-Group), [Let it Blow!](https://www.behance.net/gallery/74910125/Let-it-Blow).
- The Marraud Group gallery URL returned HTTP 403 on a direct GET. Its project embed returned HTTP 200 in **0.275 s** and requires a known project ID. Behance documents embeds for individual projects and lets creators opt out. [Project embed](https://www.behance.net/embed/project/258296801), [Behance embedding guide](https://help.behance.net/hc/en-us/articles/19288565618971-Guide-Sharing-and-Embedding-Behance-Content).
- No documented public API or feed for listing arbitrary Behance portfolios was found. Adobe documents automatic project import for a Behance profile associated with the same Adobe ID as an Adobe Portfolio site. [Adobe API catalog](https://developer.adobe.com/apis), [Adobe Portfolio import](https://help.myportfolio.com/hc/en-us/articles/360036640533-Set-a-default-Behance-import-collection).

## Candidate Worker path

Try one bounded profile fetch and parse the first page’s project cards. Bricks already uses `HTMLRewriter` for link metadata. Keep Apify as a fallback for blocked responses or unexpected markup. Verify title, ID, link, cover, order, and co-owner handling against the Apify results before relying on the direct path. The HTTP probes establish promising response times from one environment. Cloudflare Worker access, production reliability, and end-to-end Studio timing still need measurement. [Existing Worker HTML parsing](../../apps/bricks/worker/link/LinkBackend.ts#L152), [Behance import requirements](../plans/077-plan-behance-and-buy-me-a-coffee.md#2-behance).
