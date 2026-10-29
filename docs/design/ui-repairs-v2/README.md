# Cutout repair batch v2

Source: existing approved preparation/gameplay, notification, timeout, defeat and record-modal design PNGs. `manifest.json` records original LTRB source crops, crop-relative silhouettes, blanking samples and special layers. `dark.jpg` / `light.jpg` expose edges against both backgrounds. No new generated bitmap concepts in this batch.

## Asset roles and composition

- `feedback/{toast,warning,turn}`: complete fixed frame/icon with native message area; remove original lettering using documented clean-paper samples and feathered blending, trace the actual metal silhouette instead of clipping its top rail with a rounded rectangle.
- `feedback/timeout-{0,1,2}`: retain fixed explanatory text and complete crest, trace the actual frame rather than retaining room/table pixels around it.
- `feedback/defeat-title`: retain main plaque, crest, ribbons and reason plate. Reconstruct the reason plate's bottom edge from its own matching top rail; clear the baked reason and show the actual result caption natively. Runtime dimensions are 815×365, with reason label aligned inside the plate.
- `modals/live-latest`: entire button, including arrow and caption; exclude surrounding paper.
- `modals/tab-off`: complete standalone inactive tab, with native label/count. The original open-bottom tab was joined to the paper; reconstruct its lower edge by vertically reflecting its own upper half before clearing the text, then preserve the curved silhouette. Display size remains the existing 340×84.
- Preparation: `hands` + `hand-right` are behind the four cards. `left-thumb` + `right-thumb` are in front. Gameplay uses the same separation with `play-hand-*` and `play-*-thumb`. Source card remnants/table pixels excluded by corrected skin/sleeve outlines.
- `battle/card-selected`: derive its ring from the current `card-paper.png` alpha minus a 15px eroded alpha, not the obsolete card art. The native card and highlight use the same aspect ratio; the selected card group is raised and drawn last among cards, below the thumbs.

Masks use curved corner interpolation and 4× supersampling. Alpha-aware palette encoding retains antialiasing; pixels outside the zero-alpha silhouette are explicitly kept transparent. All original resource UUIDs are retained; the three new thumb layers have their own `.meta` files.

Reproduce after running any older base-art slicers/packers:

```sh
uv run --with pillow --with imagequant python scripts/repair-ui-cutouts.py
```

The script updates the battle rectangle registry and defeat size entry along with the targeted textures. It does not regenerate unrelated controls or change server rules. Runtime integration and verification: `docs/verification/ui-repairs-v2/README.md`.
