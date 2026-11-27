"""Rebuild assets/resources/art/battle/turn.png from docs/design/turn-plaque/source-master.jpg.

Extracts the isolated antique dark-walnut & burnished brass-gold plaque cleanly from pure white
(zero residual wood blocks or white halos), preserves undistorted scalloped endcaps via horizontal
midsection stretching to exact 400x83 dimensions (matching BATTLE_RECTS.turn), adds a gentle
soft contact shadow so it blends naturally on dark teal felt, and writes verification previews.
"""
from __future__ import annotations

import json
import subprocess
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
DESIGN_DIR = ROOT / "docs/design/turn-plaque"
SRC_PATH = DESIGN_DIR / "source-master.jpg"
OUT_PATH = ROOT / "assets/resources/art/battle/turn.png"

OUT_W, OUT_H = 400, 83
PLAQUE_W, PLAQUE_H = 396, 74
PLAQUE_TOP = 2


def smoothstep(e0: float, e1: float, x: np.ndarray) -> np.ndarray:
    t = np.clip((x - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def dilate_mask(mask: np.ndarray, radius: int) -> np.ndarray:
    out = mask.copy()
    h, w = mask.shape
    for _ in range(radius):
        p = np.pad(out, 1, mode="edge")
        out = (
            p[0:h, 0:w] | p[0:h, 1:w + 1] | p[0:h, 2:w + 2]
            | p[1:h + 1, 0:w] | p[1:h + 1, 1:w + 1] | p[1:h + 1, 2:w + 2]
            | p[2:h + 2, 0:w] | p[2:h + 2, 1:w + 1] | p[2:h + 2, 2:w + 2]
        )
    return out


def extract_plaque_rgba(rgb: np.ndarray) -> Image.Image:
    arr = rgb.astype(np.float32)
    r, g, b = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2]
    mx = np.maximum(np.maximum(r, g), b)
    mn = np.minimum(np.minimum(r, g), b)
    sat = (mx - mn) / np.maximum(mx, 1.0)
    lum = 0.299 * r + 0.587 * g + 0.114 * b

    # Flood-fill strictly from image corners through pure white exterior.
    h, w = lum.shape
    white_cand = (mn >= 236.0) & (sat <= 0.08)
    bg = np.zeros((h, w), dtype=bool)
    q: deque[tuple[int, int]] = deque()
    for sy, sx in ((0, 0), (0, w - 1), (h - 1, 0), (h - 1, w - 1)):
        if white_cand[sy, sx] and not bg[sy, sx]:
            bg[sy, sx] = True
            q.append((sy, sx))
    while q:
        cy, cx = q.popleft()
        for ny, nx in ((cy - 1, cx), (cy + 1, cx), (cy, cx - 1), (cy, cx + 1)):
            if 0 <= ny < h and 0 <= nx < w and white_cand[ny, nx] and not bg[ny, nx]:
                bg[ny, nx] = True
                q.append((ny, nx))

    aa_zone = dilate_mask(bg, 4) & (~bg)
    alpha = np.full((h, w), 255.0, dtype=np.float32)
    alpha[bg] = 0.0

    edge_rgb = np.array([45.0, 26.0, 12.0], dtype=np.float32)
    t = np.clip((250.0 - lum) / (250.0 - 38.0), 0.0, 1.0)
    t = np.where(t < 0.05, 0.0, t)
    alpha[aa_zone] = np.clip(t[aa_zone] * 255.0, 0.0, 255.0)

    out_rgb = arr.copy()
    t_safe = np.maximum(t, 0.08)
    defringed = np.clip((arr - (1.0 - t[:, :, None]) * 255.0) / t_safe[:, :, None], 0.0, 255.0)
    blend_edge = smoothstep(0.55, 0.15, t)[:, :, None]
    out_rgb[aa_zone] = (defringed * (1.0 - blend_edge) + edge_rgb[None, None, :] * blend_edge)[aa_zone]
    out_rgb[bg] = edge_rgb

    rgba = np.zeros((h, w, 4), dtype=np.uint8)
    rgba[:, :, :3] = np.clip(np.round(out_rgb), 0, 255).astype(np.uint8)
    rgba[:, :, 3] = np.clip(np.round(alpha), 0, 255).astype(np.uint8)

    ys, xs = np.where(rgba[:, :, 3] > 20)
    return Image.fromarray(rgba[ys.min():ys.max() + 1, xs.min():xs.max() + 1], "RGBA")


def main() -> None:
    src = np.array(Image.open(SRC_PATH).convert("RGB"))
    plaque = extract_plaque_rgba(src)
    pw, ph = plaque.size

    # Scale vertically to PLAQUE_H while keeping left/right scalloped endcaps undistorted.
    scale = PLAQUE_H / ph
    scaled_w = round(pw * scale)
    scaled = plaque.resize((scaled_w, PLAQUE_H), Image.Resampling.LANCZOS)

    # 3-slice horizontally: keep left & right 24% endcaps intact, stretch flat center strip to PLAQUE_W.
    cap = round(scaled_w * 0.24)
    left_cap = scaled.crop((0, 0, cap, PLAQUE_H))
    right_cap = scaled.crop((scaled_w - cap, 0, scaled_w, PLAQUE_H))
    mid_src = scaled.crop((cap, 0, scaled_w - cap, PLAQUE_H))
    mid_w = PLAQUE_W - 2 * cap
    mid_dst = mid_src.resize((mid_w, PLAQUE_H), Image.Resampling.LANCZOS)

    assembled = Image.new("RGBA", (PLAQUE_W, PLAQUE_H), (0, 0, 0, 0))
    assembled.paste(left_cap, (0, 0))
    assembled.paste(mid_dst, (cap, 0))
    assembled.paste(right_cap, (cap + mid_w, 0))

    # Composite onto 400x83 canvas with subtle grounded dark contact shadow for natural blending on dark teal felt.
    canvas = Image.new("RGBA", (OUT_W, OUT_H), (0, 0, 0, 0))
    ox = (OUT_W - PLAQUE_W) // 2
    shadow_alpha = assembled.getchannel("A").point(lambda v: round(v * 0.52))
    shadow = Image.new("RGBA", (OUT_W, OUT_H), (0, 0, 0, 0))
    shadow_fill = Image.new("RGBA", (PLAQUE_W, PLAQUE_H), (5, 16, 16, 255))
    shadow_fill.putalpha(shadow_alpha)
    shadow.paste(shadow_fill, (ox, PLAQUE_TOP + 4), shadow_fill)
    shadow = shadow.filter(ImageFilter.GaussianBlur(radius=2.8))

    canvas = Image.alpha_composite(canvas, shadow)
    fg = Image.new("RGBA", (OUT_W, OUT_H), (0, 0, 0, 0))
    fg.paste(assembled, (ox, PLAQUE_TOP), assembled)
    canvas = Image.alpha_composite(canvas, fg)

    canvas.save(OUT_PATH, optimize=True)
    raw_kb = OUT_PATH.stat().st_size / 1024
    try:
        subprocess.run(
            ["pngquant", "--force", "--quality=90-100", "--speed=1", "--output", str(OUT_PATH), str(OUT_PATH)],
            check=True,
        )
    except (FileNotFoundError, subprocess.CalledProcessError) as exc:
        print(f"pngquant skipped: {exc}")
    final_kb = OUT_PATH.stat().st_size / 1024

    ship = Image.open(OUT_PATH).convert("RGBA")
    for bg_hex, name in [("#0D4750", "preview-felt.png"), ("#F3E2C0", "preview-light.png")]:
        bg = Image.new("RGBA", (OUT_W + 60, OUT_H + 60), bg_hex)
        bg.paste(ship, (30, 30), ship)
        bg.convert("RGB").save(DESIGN_DIR / name)

    manifest = {
        "source": "docs/design/turn-plaque/source-master.jpg",
        "output": "assets/resources/art/battle/turn.png",
        "size": [OUT_W, OUT_H],
        "visualCenterY": PLAQUE_TOP + PLAQUE_H / 2.0,
        "sizeBytes": OUT_PATH.stat().st_size,
        "notes": "Reconstructed antique dark-walnut & burnished brass-gold turn plaque with clean transparent contour and soft felt contact shadow; replaces old cropped tray remnant.",
    }
    (DESIGN_DIR / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")
    print(f"Wrote {OUT_PATH} ({ship.size}, raw {raw_kb:.1f} KB -> shipping {final_kb:.1f} KB)")


if __name__ == "__main__":
    main()
