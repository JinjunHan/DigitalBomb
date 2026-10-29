# Runtime image sizing — 2026-10-29

Inspected all 212 PNG resources under `assets/resources`. Pixel sizes are based on the largest actual Cocos UI use, with resolution headroom; no blanket 50% scaling or arbitrary texture-size cap.

| Resource | Before | After | Display budget |
|---|---|---|---|
| `art/opponent.png` | 1024×1536 | 320×480 | Fallback actor: 153×230 design units; >2× pixel headroom |
| `art/profile/portrait-frame.png` | 512×512 | 352×352 | Largest profile frame: 234×234; 1.5× headroom |
| `art/profile/avatar-selected.png` | 128×128 | 96×96 | Selection badge: 58×58; >1.6× headroom |

Eight images were re-encoded losslessly at unchanged dimensions: lobby/background, profile/paper, profile/portrait-background, scene/room, scene/table, scene/near-left, scene/near-right, art/table. Decoded RGBA pixels were compared exactly before accepting each re-encode. The remaining 201 images are unchanged.

Full-screen backgrounds retain their pixels for camera zoom, long screens and foreground parallax. Profile paper retains its height for a 1040-unit display. Small text/button art is already close to its display budget. The 1280×1280 hourglass atlas retains all sixteen 320×320 cells and the existing frame coordinates. No palette quantization, file format changes, UUID changes, or design-source edits.

## Results

- Runtime PNG files: 38,022,449 → 34,415,714 bytes (36.26 → 32.82 MiB), saving 3.44 MiB / 9.49%.
- 3 resized; 8 losslessly optimized; 201 kept.
- `inventory.json`: every PNG's before/after dimensions, byte counts, decision and metadata hash.
- `profile-after.png`: actual rebuilt runtime screenshot; checked frame edges and selection badge readability.
- `npm run typecheck:client`: passed.
- `verify-page-details.cjs`: profile/legacy-avatar selection, feedback/controls at 390×844 and 390×600 passed.
- `npm run build:wechat`: passed. Main package unchanged at 1976.8 KB; resources 37784.7 → 34262.5 KB.
- `verify-wechat-feedback.mjs`: scene, runtime and 44 feedback textures passed.
- All image `.meta` files checked against pre-change hashes after Cocos import; unchanged.

Export: `build/wechatgame/`. Local Web verification and WeChat export only, not device validation or release. No gameplay/server code changes.

## Reuse

Run after regenerating source art; the default is an audit without writes:

```sh
python3 scripts/optimize-image-resources.py
python3 scripts/optimize-image-resources.py --apply
```

Use `--report <path>` to preserve this baseline report during future audits. The script never upscales, changes atlas dimensions, or rewrites an image when savings are below 1% or 1 KB. Only the three explicit sizing budgets permit resampling; all other candidates must preserve exact decoded RGBA pixels.
