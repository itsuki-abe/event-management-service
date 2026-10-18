# Commons design QA

final result: passed

## Evidence
- Selected reference: output/design-exploration/community-commons.png.
- Side-by-side comparison: output/commons-design-comparison.png. The mobile live region is cropped from the multi-screen board and scaled proportionally; the implementation is captured at 390 x 844 CSS pixels (device scale 1). The source board is illustrative and its drawn panel is taller, so vertical coverage differs.
- Desktop capture: output/commons-desktop-verified.png (1360 x 900).
- Browser checks: output/commons-browser-check.json. Seven routes rendered, mobile document width equals 390px, reactions increment, first comment requests a name, submitted text renders, internal navigation updates the route; no JavaScript exceptions.

## Iterations
1. Initial desktop capture exposed unavailable external icon fonts and squeezed quick links (P1). Replaced icon-font tokens with local official Phosphor SVG assets and added a fixed icon size.
2. Re-captured desktop and actual 390px mobile through Edge device emulation. The icon and horizontal overflow issues are resolved.

## Required fidelity surfaces
- Typography: real self-hosted Zen Maru Gothic, source weight hierarchy and rounded headings preserved; readable body copy.
- Spacing/layout: source four-tab mobile navigation and two-column reactions preserved. PC layouts use the full width; content scrolls above fixed mobile navigation. Increased readable type and visible labels intentionally require vertical scrolling.
- Colors: paper #FAF9F4, blue #3054DB, apricot #F5B28C, yellow #F5DB67, ink #202A34 retained. Dark labels on the pale reaction tiles are an intentional contrast improvement.
- Assets: three separate ImageGen PNGs reproduce collaboration and portrait art direction; local Phosphor library icons; real library-generated participant QR. No rasterized page screenshot is used as UI.
- Copy: selected Commons event framing, automation talk, participant actions and venue guidance retained. Sample speakers are consistent with the selected original board.

## Scope and remaining work
The implementation is a frontend interaction prototype in the existing app. Authentication, durable data, cross-device realtime synchronization and WebRTC transport are not connected. Avatar reuse and exact illustration differences are acceptable prototype polish differences (P3).

## Checks
- [x] Seven routes and 390px / desktop layouts.
- [x] Local assets and font loading.
- [x] Reaction, comment/name and navigation browser checks.
- [x] Static checks and TypeScript.
- [x] Production build.
