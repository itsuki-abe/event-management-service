# Commons integration verification

PR #28 conflict resolution preserves the database-backed React screens from main and integrates the generated Commons illustrations and avatars.

- Participant: home, event guide, live session, engagement, event team.
- Organizer, speaker and projection screens retain shared server state and timer behavior.
- Fonts are self-hosted; redundant Google Fonts requests and the obsolete demo renderer were removed.
- Passed: TypeScript, 12 existing tests (84 assertions), production build.
- Biome fixed integration formatting successfully.
- The earlier prototype screenshots describe the original exploration; browser interaction checks were not repeated for this merge.

## Venue guide — Issues #10, #11, #12

The venue page prioritizes one organizer notice, exact Wi-Fi copy values and a hashtag, followed by category-specific venue details. It uses the existing Commons paper/blue/apricot/yellow palette, typography and navigation. At 1440×900 the information index and detail are side by side; at 390×844 the same details use native disclosure controls with a close action that restores focus. Hidden or empty information has no placeholder card.

Organizer settings use the existing organizer login at `/admin/guide?eventId=1`. Draft values survive save failures, publishing is explicit, and empty sections remain unpublished. Guides refresh every 15 seconds and on returning to the page. A failed refresh keeps the previous data with a recovery message. Category keys preserve the selected or expanded detail when the saved database IDs change.

Verification uses synthetic fixtures in an isolated temporary D1 database; it never populates the user's local or production event. `bun test` passes 20 tests (152 assertions), including authorization, event isolation, visibility, exact Wi-Fi whitespace, malformed input and transaction rollback. TypeScript, the production build and Biome checks pass. The browser script and rendered evidence are `scripts/venue-browser.mjs` and `output/venue-qa/`; the latter is intentionally ignored by Git. `.gitattributes` aligns Windows checkouts with Biome's LF formatting.

The browser run passes in installed Edge with 1440×900 and 390×844 layouts. It checks exact clipboard payloads (using a controlled clipboard adapter), denied-copy selection fallback, keyboard disclosure and focus return, empty/hidden/loading/permission states, stale-data recovery, organizer save retry, preview and restored saved values. Copy targets measure 90×44px with a solid 3px focus outline. Reduced-motion emulation reports zero animation/transition durations. Fonts finished loading in every final capture. Participant and organizer screenshots were visually reviewed. Physical phone browsers and native OS clipboard integration were not exercised.

## PR #34 integration with main

Main's shared organizer navigation and cookie authentication take precedence over the separate venue-management links. Venue settings join LT progression and comment moderation as a third management tab, with a single page heading hierarchy and wrapping tabs on narrow screens. The authentication parser stays independent of the Cloudflare runtime and is shared by all three server surfaces. Main's registration-first home, QR flow and optional X username remain intact.

The merged API suite passes 23 tests (199 assertions), including main's added profile validation. Venue browser checks also cover the active management tab and the width of all three tabs at 360px and 390px. The refreshed participant and organizer screenshots have been visually reviewed.

The LT browser regression also passes: shared organizer authorization and comment management, four-screen timer synchronization, pause/reload/next/overtime/reconnection, and 390px/900px/1440px layouts. A separate mobile participant checks the registration-only home, registration with X username persistence, the registered home, and the QR's encoded event URL. Those captures are in `output/playwright/`. TypeScript, Biome and the production build pass for the integration.

Concurrent updates were also integrated before pushing: the participant directory and X-profile URL input use the single `x_username` column and `xUsername` API field; the duplicate migration was removed. The latest main's screen-sharing implementation, registered-speaker selection and split documentation were preserved. Final unit coverage is 27 passing tests / 267 assertions. TypeScript, Biome and production build also pass for this combined revision.
