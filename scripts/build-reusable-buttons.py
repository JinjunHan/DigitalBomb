"""Generate 3 reusable blank scalloped brass-beveled tabletop buttons (vermilion, ivory, emerald).

Reuses the approved master plaque silhouette and authentic damask textures from
scripts/build-ui-polish-art.py so dynamic-text buttons across Leaderboard, Daily Cipher,
Deduction Notes, Confirm dialogs, and Result screen share 100% unified art craft.
"""
from __future__ import annotations

import importlib.util
from pathlib import Path
import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "assets/resources/art/learning-v2"
TEMPLATE_META = OUT_DIR / "return.png.meta"

spec = importlib.util.spec_from_file_location("ui_polish", ROOT / "scripts/build-ui-polish-art.py")
ui_polish = importlib.util.module_from_spec(spec)  # type: ignore[arg-type]
assert spec and spec.loader
spec.loader.exec_module(ui_polish)


def build_emerald_plaque(master_img: Image.Image, master_cavity: np.ndarray, out_w: int, out_h: int) -> Image.Image:
    """Create a forest-emerald damask scalloped plaque preserving the exact warm antique brass/gold outer frame."""
    vermilion = ui_polish.make_framed_plaque(
        master_img, master_cavity, out_w, out_h,
        style="vermilion",
        shadow_rgba=(36, 20, 8, 0.24),
        pad_x=4, pad_top=3, pad_bottom=6,
        cap_ratio=0.21,
    )
    ivory = ui_polish.make_framed_plaque(
        master_img, master_cavity, out_w, out_h,
        style="ivory",
        shadow_rgba=(36, 20, 8, 0.24),
        pad_x=4, pad_top=3, pad_bottom=6,
        cap_ratio=0.21,
    )
    va = np.array(vermilion).astype(np.float32)
    ia = np.array(ivory).astype(np.float32)
    # Pixels that differ between vermilion & ivory belong strictly to the inner cavity (outer brass frame & gold diamonds are identical!).
    diff = np.abs(va[:, :, :3] - ia[:, :, :3]).max(axis=2)
    mask = np.clip((diff - 14.0) / 36.0, 0.0, 1.0)
    lum = (0.299 * va[:, :, 0] + 0.587 * va[:, :, 1] + 0.114 * va[:, :, 2]) / 255.0
    # Rich vintage tabletop emerald lacquer matching invite.png
    er = np.clip(lum * 62.0 + 8.0, 0, 255)
    eg = np.clip(lum * 222.0 + 30.0, 0, 255)
    eb = np.clip(lum * 138.0 + 20.0, 0, 255)
    out = va.copy()
    out[:, :, 0] = va[:, :, 0] * (1.0 - mask) + er * mask
    out[:, :, 1] = va[:, :, 1] * (1.0 - mask) + eg * mask
    out[:, :, 2] = va[:, :, 2] * (1.0 - mask) + eb * mask
    return Image.fromarray(np.clip(np.round(out), 0, 255).astype(np.uint8), "RGBA")


def main() -> None:
    ui_polish.ensure_originals()
    master_img, master_cavity = ui_polish.extract_master_plaque()

    W, H = 320, 92
    # Light grounded shadow tailored for warm parchment surfaces (no harsh black box shadow)
    parchment_shadow = (36, 20, 8, 0.24)

    primary = ui_polish.make_framed_plaque(
        master_img, master_cavity, W, H,
        style="vermilion",
        shadow_rgba=parchment_shadow,
        pad_x=4, pad_top=3, pad_bottom=6,
        cap_ratio=0.21,
    )
    secondary = ui_polish.make_framed_plaque(
        master_img, master_cavity, W, H,
        style="ivory",
        shadow_rgba=parchment_shadow,
        pad_x=4, pad_top=3, pad_bottom=6,
        cap_ratio=0.21,
    )
    emerald = build_emerald_plaque(master_img, master_cavity, W, H)

    outputs = [
        ("btn-primary.png", primary),
        ("btn-secondary.png", secondary),
        ("btn-emerald.png", emerald),
    ]
    for name, img in outputs:
        out = OUT_DIR / name
        kb = ui_polish.save_quantized(img, out)
        ui_polish.ensure_meta(out, TEMPLATE_META)
        print(f"Saved {out.relative_to(ROOT)} ({img.size[0]}x{img.size[1]}, {kb:.1f} KB)")

    # Verification contact sheet on both cream parchment & dark teal felt
    sheet = Image.new("RGBA", (W * 2 + 60, H * 3 + 80), (0, 0, 0, 0))
    left_bg = Image.new("RGBA", (W + 30, sheet.height), (244, 228, 196, 255))
    right_bg = Image.new("RGBA", (W + 30, sheet.height), (23, 62, 60, 255))
    sheet.paste(left_bg, (0, 0))
    sheet.paste(right_bg, (W + 30, 0))
    for i, (_, img) in enumerate(outputs):
        y = 20 + i * (H + 20)
        sheet.alpha_composite(img, (15, y))
        sheet.alpha_composite(img, (W + 45, y))
    check_path = Path("/Users/hanjinjun/.gemini/antigravity/brain/1f9fc7a5-8d64-47ca-a87e-a25ef6ee8264/scratch/reusable-buttons-check.png")
    check_path.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(check_path)
    print("Check sheet:", check_path)


if __name__ == "__main__":
    main()
