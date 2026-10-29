# Opaque backgrounds to JPEG — 2026-10-29

Converted only three verified fully opaque images (alpha min/max both 255):

| Resource | Dimensions retained | PNG | JPEG |
|---|---|---:|---:|
| Lobby fallback background | 941×1672 | 1957 KB | 462 KB |
| Layered scene room | 864×1536 | 1798 KB | 514 KB |
| Legacy complete table background | 941×1672 | 2001 KB | 429 KB |

High-quality lossy JPEG, quality 92, full 4:4:4 chroma, baseline encoding. Saved 4352.5 KB (4.25 MiB). No dimension reduction. Original PNG masters are preserved in `docs/design/opaque-backgrounds/` outside runtime resources; `scripts/convert-opaque-backgrounds.py` can reproduce the conversion from those masters, avoiding cumulative JPEG recompression.

The active table layer, foreground plants/lantern, buttons, cards, portraits and text-bearing UI remain PNG. No alpha-bearing resource was converted. The three Cocos `.meta` files were renamed with their images and preserve UUIDs; Cocos updated imported file extensions. Existing extensionless resource keys still resolve to the same images. Old runtime PNG copies are removed to avoid duplicate packaged content.

## Verification

- Full-size room crops compared in `room-comparison.jpg`: no obvious loss in shelf, foliage, window-frame or wicker details at this quality. JPEG is not pixel-identical; measured PSNR for the three images is 41–43 dB, recorded along with exact byte counts in `conversion.json`.
- `npm run typecheck:client`: passed.
- `verify-jpeg-backgrounds.cjs`: loaded all three actual Cocos textures using existing resource keys; asserted unchanged dimensions, captured lobby/game/matching compositions, no runtime errors.
- `npm run build:wechat`: successful; main 1976.8 KB, resources 34262.5 → 29910.0 KB. Output `build/wechatgame/`.
- All three JPEGs confirmed in the exported package under their original UUIDs. `verify-wechat-feedback.mjs` passed scene/runtime/44-texture checks.

Local Web review and WeChat export verification only; no device testing, server deployment or release in this task.
