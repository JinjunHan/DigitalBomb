# Device-debug total package limit — 2026-10-29

The reported device-debug error was `source size 31862KB exceed max limit 30MB`. The previous exporter checked the 4 MiB main package only, while the resource subpackage still counted toward the total source limit. The prior local export summed to 31886.8 KB; tool-specific exclusions account for a small counting difference, so this project now targets a conservative 28 MiB total.

## Fix

- Archived five unreferenced runtime textures and their metadata under `docs/design/retired-runtime/`: old lobby `help`, `primary`, `secondary`, `utility`, and the legacy full `table.jpg`. Current full-art buttons and the layered scene remain. None of these five UUIDs appears in the exported package or runtime scene/script references.
- Kept original PNG masters for profile paper and the hourglass atlas in `docs/design/package-masters/`. Targeted palette encoding reduces paper from 2222996 to 1006952 bytes and the atlas from 1734563 to 501387 bytes. Dimensions remain 1166×1349 and 1280×1280; all sixteen atlas frames remain 320×320. Resource UUIDs remain unchanged.
- Palette compression is lossy in color/partial alpha, not a lossless claim. Exact zero-alpha exterior pixels are explicitly retained to avoid halos. Dark/light composite PSNR: paper 46.95/46.72 dB, hourglass 40.24/40.28 dB. Full-size side-by-side review found no obvious block artifacts or contour degradation; runtime profile and matching screenshots are included.
- `scripts/check-wechat-size.mjs` now checks main ≤4 MiB, main + all subpackages ≤30 MiB and a stricter project budget ≤28 MiB, reserving 2 MiB. This script is already called by `npm run build:wechat`; an over-budget export fails the build command.
- Updated legacy slicer/JPEG packer to avoid reintroducing retired runtime images. `scripts/compress-large-png.py` regenerates the two optimized assets from archived masters, validates output before replacing runtime files, and preserves frame geometry.

## Validation

- 50 tests passed, including four new package-budget tests: normal output, aggregate overflow with a valid main package, safety-margin overflow, and main-package overflow.
- Server/client typechecks passed.
- `verify-page-details.cjs`: profile, avatar, input states and tall/short layouts passed.
- `verify-package-art.cjs`: real online queue, all 16 atlas frames, frame advancement and cancellation passed without page errors.
- `verify-wechat-feedback.mjs`: scene/runtime and 44 feedback textures passed.
- Local WeChat export: **main 1976.8 KB + resources 26240.7 KB = total 28217.5 KB (27.56 MiB)**. Headroom to 30 MiB: **2502.5 KB (2.44 MiB)**.

Export folder: `build/wechatgame/`. Recompile that directory in WeChat Developer Tools and retry device debugging. This report confirms local export and browser runtime checks; a successful on-device debug session has not yet been verified. No server deployment or release.
