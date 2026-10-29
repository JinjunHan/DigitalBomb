# Overview detail fixes — 2026-10-29

## Changes

- Default avatar IDs 0–7 now consistently map to the four existing illustrated portraits. The profile draft/selection uses the same mapping; saves persist the selected ID. Existing server records do not need migration. Remote WeChat portraits retain priority and use the same illustrated fallback while loading/failing.
- Opponent seat and guess feedback share the actual player's portrait. The feedback occupies the upper-right seat region, leaving round navigation and guess records visible. The underlying seat identity/cards hide temporarily, including across UI redraws, and restore after feedback.
- Unavailable preparation/guess controls use grayscale and reduced opacity; four valid input digits restore the active state.
- Friend waiting content moves upward by reducing tall-screen surplus spacing; navigation stays fixed.
- Opponent/local nicknames, preparation status, rules artwork and secret status have larger readable regions. Long opponent names truncate and remain tappable for the full name.
- Recut the original draw crest and both return-to-lobby buttons: removed the room backdrop above the crest, paper corners around the orange button, and wood behind the cream button.

## Art pipeline

Sources remain `docs/design/feedback-v1/07-draw-result.png`, `05-cancelled-states.png`, and `06-defeat-result.png`. `implementation-slices.json` records source LTRB rectangles and local outline coordinates. Existing resource UUIDs and dimensions are preserved.

The three fixed control layers are original artwork, with corrected supersampled alpha contours from the editable extraction pipeline; no replacement system-drawn controls. Avatar content is a separate circular layer with the existing hollow portrait frame. Text, selection, disabled state and transient visibility remain native UI.

An imagegen cleanup attempt was evaluated but rejected because its background was not cleanly transparent. No generated replacement was shipped. The existing native slicing pipeline was repaired instead:

```sh
uv run --with pillow --with imagequant python scripts/slice-feedback.py draw-title home result-home
```

`light-recut.jpg` and `dark-recut.jpg` in the design folder show the isolated controls against both backgrounds. Targeted recuts leave all other textures and the size registry untouched.

## Verification

- `npm test`: 46 passed.
- `npm run typecheck`, `npm run typecheck:client`: passed.
- `verify-journey.cjs`: real two-client match through lobby/profile/friend room/preparation/reply/draw/records/rematch/leave and matching cancellation; refreshed journey screenshots and overview.
- `verify-feedback.cjs`: opponent/own feedback, timeout/cancellation/results, rematch, controls, motion and short-screen regression passed.
- `verify-page-details.cjs`: legacy ID 7 maps to selected portrait 3; disabled/enabled guess controls; feedback bounds do not intersect navigation or records at 390×844 and 390×600; the seat restores after feedback even with an intermediate redraw.
- `npm run build:wechat`: passed, output `build/wechatgame/`; main package 1976.8 KB, resource subpackage total 37784.7 KB. `verify-wechat-feedback.mjs` passed scene/44-texture/runtime checks.

These are local browser/runtime checks and WeChat export checks, not WeChat device testing or a release. No server deployment in this task.
