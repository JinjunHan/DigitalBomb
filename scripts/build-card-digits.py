"""Build custom 0-9 + '?' artistic playing-card digit atlas from docs/design/card-digits/source-master.jpg.

Produces a 2-row x 11-column transparent RGBA spritesheet:
  - Row 0: Espresso-Umber & Antique Brass-Gold (normal card faces)
  - Row 1: Royal Lacquer Crimson & Antique Brass-Gold (victory / opponent cracked secret reveal)
  - Columns 0..10: '0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '?'

Also writes Cocos Creator .meta (preserving existing UUID on re-runs), manifest.json,
and dark/light/on-card verification sheets under docs/design/card-digits/.
"""
from __future__ import annotations

import json
import subprocess
import uuid
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
DESIGN_DIR = ROOT / "docs/design/card-digits"
SRC_PATH = DESIGN_DIR / "source-master.jpg"
OUT_PATH = ROOT / "assets/resources/art/battle/card-digits.png"
CARD_PAPER_PATH = ROOT / "assets/resources/art/battle/card-paper.png"

GLYPHS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "?"]
ROUND_GLYPHS = {"0", "2", "3", "5", "6", "8", "9", "?"}
CELL_W = 144
CELL_H = 180
TARGET_FLAT_H = 148
TARGET_ROUND_H = 152


def smoothstep(edge0: float, edge1: float, x: np.ndarray) -> np.ndarray:
    t = np.clip((x - edge0) / (edge1 - edge0), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def dilate_mask(mask: np.ndarray, radius: int) -> np.ndarray:
    out = mask.copy()
    h, w = mask.shape
    for _ in range(radius):
        padded = np.pad(out, 1, mode="edge")
        out = (
            padded[0:h, 0:w] | padded[0:h, 1:w + 1] | padded[0:h, 2:w + 2]
            | padded[1:h + 1, 0:w] | padded[1:h + 1, 1:w + 1] | padded[1:h + 1, 2:w + 2]
            | padded[2:h + 2, 0:w] | padded[2:h + 2, 1:w + 1] | padded[2:h + 2, 2:w + 2]
        )
    return out


def extract_glyph_rgba(rgb: np.ndarray) -> np.ndarray:
    """Clean white-matte extraction with un-premultiplied de-fringing.

    Preserves 100% opaque interior espresso ink and brass-gold filigree while
    giving crisp, halo-free anti-aliased edges against both dark and cream backgrounds.
    """
    arr = rgb.astype(np.float32)
    r, g, b = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2]
    mx = np.maximum(np.maximum(r, g), b)
    mn = np.minimum(np.minimum(r, g), b)
    sat = (mx - mn) / np.maximum(mx, 1.0)
    lum = 0.299 * r + 0.587 * g + 0.114 * b

    # Seed pure white regions (exterior + enclosed counters inside 0, 4, 6, 8, 9).
    white_seed = (mn >= 238.0) & (sat <= 0.08)
    # Remove any isolated 1px speckles inside gold highlights just in case:
    # flood-fill from large white regions (>= 15 pixels) only.
    h, w = white_seed.shape
    visited = np.zeros((h, w), dtype=bool)
    bg_mask = np.zeros((h, w), dtype=bool)
    for y in range(h):
        for x in range(w):
            if white_seed[y, x] and not visited[y, x]:
                q = deque([(y, x)])
                visited[y, x] = True
                comp = []
                while q:
                    cy, cx = q.popleft()
                    comp.append((cy, cx))
                    for ny, nx in ((cy - 1, cx), (cy + 1, cx), (cy, cx - 1), (cy, cx + 1)):
                        if 0 <= ny < h and 0 <= nx < w and white_seed[ny, nx] and not visited[ny, nx]:
                            visited[ny, nx] = True
                            q.append((ny, nx))
                if len(comp) >= 15:
                    for cy, cx in comp:
                        bg_mask[cy, cx] = True

    # Anti-aliasing transition zone: 4px band adjacent to white background / holes.
    aa_zone = dilate_mask(bg_mask, 4) & (~bg_mask)

    alpha = np.full((h, w), 255.0, dtype=np.float32)
    alpha[bg_mask] = 0.0

    # Linear un-premultiply in the 4px boundary band (outer rim is espresso ink ~[34, 16, 3], lum ~20).
    ink_rgb = np.array([34.0, 16.0, 4.0], dtype=np.float32)
    ink_lum = 20.0
    white_lum = 250.0
    t = np.clip((white_lum - lum) / (white_lum - ink_lum), 0.0, 1.0)
    # Apply slight contrast tightening to kill JPG ringing near pure white.
    t = np.where(t < 0.04, 0.0, t)
    alpha[aa_zone] = np.clip(t[aa_zone] * 255.0, 0.0, 255.0)

    out_rgb = arr.copy()
    # Un-premultiply RGB in aa_zone so semi-transparent pixels carry true dark espresso color (zero white halo).
    t_safe = np.maximum(t, 0.08)
    defringed = np.clip((arr - (1.0 - t[:, :, None]) * 255.0) / t_safe[:, :, None], 0.0, 255.0)
    # For very faint edge pixels (t < 0.55), bias smoothly toward pure espresso ink to eliminate JPG noise.
    blend_ink = smoothstep(0.55, 0.15, t)[:, :, None]
    clean_edge = defringed * (1.0 - blend_ink) + ink_rgb[None, None, :] * blend_ink
    out_rgb[aa_zone] = clean_edge[aa_zone]
    out_rgb[bg_mask] = ink_rgb

    rgba = np.zeros((h, w, 4), dtype=np.uint8)
    rgba[:, :, :3] = np.clip(np.round(out_rgb), 0, 255).astype(np.uint8)
    rgba[:, :, 3] = np.clip(np.round(alpha), 0, 255).astype(np.uint8)
    return rgba


def to_crimson_gold(rgba: np.ndarray) -> np.ndarray:
    """Derive a matching Royal Lacquer Crimson + Antique Brass-Gold variant from an Espresso-Gold glyph.

    Preserves the warm antique gold inline filigree & diamond accents while shifting the
    carved dark espresso body to rich lacquer crimson (#7C1711 -> #A3241A).
    """
    out = rgba.copy().astype(np.float32)
    r, g, b, a = out[:, :, 0], out[:, :, 1], out[:, :, 2], out[:, :, 3]
    mx = np.maximum(np.maximum(r, g), b)
    mn = np.minimum(np.minimum(r, g), b)
    sat = (mx - mn) / np.maximum(mx, 1.0)
    lum = 0.299 * r + 0.587 * g + 0.114 * b

    # Gold filigree pixels have higher luminance AND warm yellow-gold saturation.
    gold_w = smoothstep(50.0, 96.0, lum) * smoothstep(0.20, 0.32, sat)

    # Map dark espresso ink luminance [12..58] -> deep carved royal crimson with subtle relief.
    norm_l = np.clip((lum - 14.0) / 48.0, 0.0, 1.0)
    crim_r = 104.0 + norm_l * 56.0   # 104 -> 160
    crim_g = 17.0 + norm_l * 19.0    # 17 -> 36
    crim_b = 13.0 + norm_l * 13.0    # 13 -> 26

    # Lift gold filigree slightly so warm brass gleams crisply against crimson lacquer.
    gold_r = np.clip(r * 1.09 + 10.0, 0.0, 255.0)
    gold_g = np.clip(g * 1.07 + 8.0, 0.0, 255.0)
    gold_b = np.clip(b * 1.02 + 2.0, 0.0, 255.0)

    out[:, :, 0] = crim_r * (1.0 - gold_w) + gold_r * gold_w
    out[:, :, 1] = crim_g * (1.0 - gold_w) + gold_g * gold_w
    out[:, :, 2] = crim_b * (1.0 - gold_w) + gold_b * gold_w
    out[:, :, 3] = a
    return np.clip(np.round(out), 0, 255).astype(np.uint8)


def find_glyph_boxes(rgb: np.ndarray) -> list[tuple[int, int, int, int]]:
    mask = (rgb.min(axis=2) < 230) | ((rgb.max(axis=2) - rgb.min(axis=2)) > 20)
    ys = np.where(mask.any(axis=1))[0]
    row_gaps = np.where(np.diff(ys) > 20)[0]
    rows: list[tuple[int, int]] = []
    start = int(ys[0])
    for g in row_gaps:
        rows.append((start, int(ys[g])))
        start = int(ys[g + 1])
    rows.append((start, int(ys[-1])))
    assert len(rows) == 2, f"Expected 2 rows, got {len(rows)}: {rows}"

    boxes: list[tuple[int, int, int, int]] = []
    for y0, y1 in rows:
        xs = np.where(mask[y0:y1 + 1].any(axis=0))[0]
        col_gaps = np.where(np.diff(xs) > 15)[0]
        x_start = int(xs[0])
        col_ranges: list[tuple[int, int]] = []
        for g in col_gaps:
            col_ranges.append((x_start, int(xs[g])))
            x_start = int(xs[g + 1])
        col_ranges.append((x_start, int(xs[-1])))
        for x0, x1 in col_ranges:
            sub = mask[y0:y1 + 1, x0:x1 + 1]
            sub_ys = np.where(sub.any(axis=1))[0]
            gy0 = y0 + int(sub_ys[0])
            gy1 = y0 + int(sub_ys[-1])
            pad = 6
            boxes.append((
                max(0, x0 - pad),
                max(0, gy0 - pad),
                min(rgb.shape[1], x1 + 1 + pad),
                min(rgb.shape[0], gy1 + 1 + pad),
            ))
    assert len(boxes) == 11, f"Expected 11 glyphs, got {len(boxes)}"
    return boxes


def fit_glyph_to_cell(glyph_img: Image.Image, label: str) -> Image.Image:
    # Trim strictly to alpha > 16 bounding box for accurate height normalization.
    alpha = np.array(glyph_img)[:, :, 3]
    ys, xs = np.where(alpha > 16)
    y0, y1 = int(ys.min()), int(ys.max()) + 1
    x0, x1 = int(xs.min()), int(xs.max()) + 1
    trimmed = glyph_img.crop((x0, y0, x1, y1))

    target_h = TARGET_ROUND_H if label in ROUND_GLYPHS else TARGET_FLAT_H
    scale = target_h / trimmed.height
    new_w = round(trimmed.width * scale)
    max_w = CELL_W - 20
    if new_w > max_w:
        scale = max_w / trimmed.width
        new_w = max_w
        target_h = round(trimmed.height * scale)

    resized = trimmed.resize((new_w, target_h), Image.Resampling.LANCZOS)

    cell = Image.new("RGBA", (CELL_W, CELL_H), (0, 0, 0, 0))
    # Optical horizontal centering (blend bounding-box center with alpha center-of-mass).
    r_alpha = np.array(resized)[:, :, 3].astype(np.float32)
    x_coords = np.arange(new_w, dtype=np.float32)
    com_x = float((r_alpha.sum(axis=0) * x_coords).sum() / max(r_alpha.sum(), 1.0))
    opt_center_x = 0.65 * (new_w / 2.0) + 0.35 * com_x
    paste_x = round(CELL_W / 2.0 - opt_center_x)
    paste_y = round((CELL_H - target_h) / 2.0)
    cell.paste(resized, (paste_x, paste_y), resized)
    return cell


def ensure_meta(png_path: Path) -> None:
    meta_path = png_path.with_suffix(".png.meta")
    if meta_path.exists():
        return
    template = json.loads((ROOT / "assets/resources/art/lobby/digits.png.meta").read_text())
    old_uuid = template["uuid"]
    new_uuid = str(uuid.uuid4())
    template["subMetas"]["6c48a"]["displayName"] = png_path.stem
    raw = json.dumps(template, indent=2).replace(old_uuid, new_uuid) + "\n"
    meta_path.write_text(raw)


def main() -> None:
    src = np.array(Image.open(SRC_PATH).convert("RGB"))
    boxes = find_glyph_boxes(src)

    atlas = Image.new("RGBA", (CELL_W * len(GLYPHS), CELL_H * 2), (0, 0, 0, 0))
    metrics = []
    for idx, (label, (x0, y0, x1, y1)) in enumerate(zip(GLYPHS, boxes)):
        crop_rgb = src[y0:y1, x0:x1]
        rgba_ink = extract_glyph_rgba(crop_rgb)
        rgba_crimson = to_crimson_gold(rgba_ink)

        cell_ink = fit_glyph_to_cell(Image.fromarray(rgba_ink, "RGBA"), label)
        cell_crimson = fit_glyph_to_cell(Image.fromarray(rgba_crimson, "RGBA"), label)

        atlas.paste(cell_ink, (idx * CELL_W, 0), cell_ink)
        atlas.paste(cell_crimson, (idx * CELL_W, CELL_H), cell_crimson)
        metrics.append({"glyph": label, "sourceBox": [x0, y0, x1, y1], "col": idx})

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    atlas.save(OUT_PATH, optimize=True)
    raw_kb = OUT_PATH.stat().st_size / 1024

    # Compress with pngquant for tiny WeChat package footprint while keeping crisp alpha & gold detail.
    try:
        subprocess.run(
            ["pngquant", "--force", "--quality=90-100", "--speed=1", "--output", str(OUT_PATH), str(OUT_PATH)],
            check=True,
        )
    except (FileNotFoundError, subprocess.CalledProcessError) as exc:
        print(f"pngquant skipped: {exc}")

    final_kb = OUT_PATH.stat().st_size / 1024
    ensure_meta(OUT_PATH)

    # Reload quantized atlas so previews verify the EXACT shipping bytes!
    ship = Image.open(OUT_PATH).convert("RGBA")

    for bg_hex, name in [("#173E3C", "preview-dark.png"), ("#F3E2C0", "preview-light.png")]:
        bg = Image.new("RGBA", (ship.width + 40, ship.height + 40), bg_hex)
        bg.paste(ship, (20, 20), ship)
        bg.convert("RGB").save(DESIGN_DIR / name)

    # On-card verification mockup: place all 11 espresso-gold glyphs + 4 crimson-gold victory cards onto real card-paper.png
    paper = Image.open(CARD_PAPER_PATH).convert("RGBA")
    card_w, card_h = 152, 206
    paper_scaled = paper.resize((card_w, card_h), Image.Resampling.LANCZOS)
    gap = 14
    cols_row1 = 6
    canvas_w = cols_row1 * card_w + (cols_row1 + 1) * gap
    canvas_h = 3 * card_h + 4 * gap
    board = Image.new("RGBA", (canvas_w, canvas_h), "#173E3C")

    # Row 0: 0 1 2 3 4 5 (espresso-gold)
    # Row 1: 6 7 8 9 ? (espresso-gold)
    # Row 2: 0 1 2 3 (crimson-gold victory reveal) + 8 9 (crimson-gold)
    layout = [
        [(i, 0) for i in range(6)],
        [(i, 0) for i in range(6, 11)],
        [(0, 1), (1, 1), (2, 1), (3, 1), (7, 1), (8, 1)],
    ]
    glyph_draw_h = round(card_h * 0.64)
    glyph_draw_w = round(glyph_draw_h * (CELL_W / CELL_H))
    for r_idx, items in enumerate(layout):
        row_total_w = len(items) * card_w + (len(items) - 1) * gap
        start_x = (canvas_w - row_total_w) // 2
        y = gap + r_idx * (card_h + gap)
        for c_idx, (g_col, g_row) in enumerate(items):
            x = start_x + c_idx * (card_w + gap)
            board.paste(paper_scaled, (x, y), paper_scaled)
            cell = ship.crop((g_col * CELL_W, g_row * CELL_H, (g_col + 1) * CELL_W, (g_row + 1) * CELL_H))
            cell_s = cell.resize((glyph_draw_w, glyph_draw_h), Image.Resampling.LANCZOS)
            board.paste(cell_s, (x + (card_w - glyph_draw_w) // 2, y + (card_h - glyph_draw_h) // 2), cell_s)
    board.convert("RGB").save(DESIGN_DIR / "preview-cards.png")

    manifest = {
        "source": "docs/design/card-digits/source-master.jpg",
        "output": "assets/resources/art/battle/card-digits.png",
        "cell": [CELL_W, CELL_H],
        "columns": GLYPHS,
        "rows": ["ink-gold", "crimson-gold"],
        "sizeBytes": OUT_PATH.stat().st_size,
        "extraction": "Flood-filled white background/counter matte + 4px un-premultiplied de-fringe; optical cap-height & CoM centering; HSV-selective crimson-gold row preserving antique brass-gold filigree.",
        "glyphs": metrics,
    }
    (DESIGN_DIR / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")
    print(f"Wrote {OUT_PATH} ({ship.size}, raw {raw_kb:.1f} KB -> shipping {final_kb:.1f} KB)")


if __name__ == "__main__":
    main()
