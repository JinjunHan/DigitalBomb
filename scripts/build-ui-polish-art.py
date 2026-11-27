"""Build unified, transparent-contour antique tabletop UI frames, plaques, buttons, and tabs.

Reconstructs clean, seamless artwork with zero residual background corners/halos from the
project's pristine painted master textures (docs/design/turn-plaque/source-master.jpg,
rematch.png damask lacquer, close.png ivory parchment, copy.png beveled silhouette,
profile/wechat.png icon, and authentic embossed gold calligraphy/icons from existing slices).

Outputs:
  1. assets/resources/art/learning-v2/title-online.png (+ title-friend, title-hub, title-tutorial, banner)
  2. assets/resources/art/feedback/match.png, result-home.png, rematch.png
  3. assets/resources/art/friend/invite.png (+ .meta)
  4. assets/resources/art/learning-v2/tab-positions.png, tab-history.png,
     tab-positions-off.png (+ .meta), tab-history-off.png (+ .meta), return.png
  5. Verification contact sheets under docs/design/ui-polish-v3/ (dark felt + cream parchment).
"""
from __future__ import annotations

import json
import shutil
import subprocess
import uuid
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
DESIGN_DIR = ROOT / "docs/design/ui-polish-v3"
ORIG_DIR = DESIGN_DIR / "originals"
PLAQUE_MASTER = ROOT / "docs/design/turn-plaque/source-master.jpg"

ORIG_SOURCES = {
    "title-online": ROOT / "assets/resources/art/learning-v2/title-online.png",
    "title-friend": ROOT / "assets/resources/art/learning-v2/title-friend.png",
    "title-hub": ROOT / "assets/resources/art/learning-v2/title-hub.png",
    "title-tutorial": ROOT / "assets/resources/art/learning-v2/title-tutorial.png",
    "banner": ROOT / "assets/resources/art/learning-v2/banner.png",
    "tab-positions": ROOT / "assets/resources/art/learning-v2/tab-positions.png",
    "tab-history": ROOT / "assets/resources/art/learning-v2/tab-history.png",
    "return": ROOT / "assets/resources/art/learning-v2/return.png",
    "match": ROOT / "assets/resources/art/feedback/match.png",
    "result-home": ROOT / "assets/resources/art/feedback/result-home.png",
    "rematch": ROOT / "assets/resources/art/feedback/rematch.png",
    "copy": ROOT / "assets/resources/art/friend/copy.png",
    "close": ROOT / "assets/resources/art/friend/close.png",
    "wechat": ROOT / "assets/resources/art/profile/wechat.png",
}


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


def erode_mask(mask: np.ndarray, radius: int) -> np.ndarray:
    return ~dilate_mask(~mask, radius)


def ensure_originals() -> None:
    ORIG_DIR.mkdir(parents=True, exist_ok=True)
    for name, src in ORIG_SOURCES.items():
        dst = ORIG_DIR / f"{name}.png"
        if not dst.exists() and src.exists():
            shutil.copy2(src, dst)


def load_orig(name: str) -> Image.Image:
    return Image.open(ORIG_DIR / f"{name}.png").convert("RGBA")


def save_quantized(img: Image.Image, out_path: Path) -> float:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    img.save(out_path, optimize=True)
    try:
        subprocess.run(
            ["pngquant", "--force", "--quality=88-100", "--speed=1", "--output", str(out_path), str(out_path)],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
    except (FileNotFoundError, subprocess.CalledProcessError):
        pass
    return out_path.stat().st_size / 1024.0


def ensure_meta(png_path: Path, template_path: Path) -> None:
    meta_path = png_path.with_suffix(".png.meta")
    if meta_path.exists():
        return
    template = json.loads(template_path.read_text())
    old_uuid = template["uuid"]
    new_uuid = str(uuid.uuid4())
    if "subMetas" in template and "6c48a" in template["subMetas"]:
        template["subMetas"]["6c48a"]["displayName"] = png_path.stem
    raw = json.dumps(template, indent=2).replace(old_uuid, new_uuid) + "\n"
    meta_path.write_text(raw)


def extract_master_plaque() -> tuple[Image.Image, np.ndarray]:
    """Extract spotless scalloped antique brass-and-walnut plaque + inner cavity mask from source-master.jpg."""
    arr = np.array(Image.open(PLAQUE_MASTER).convert("RGB")).astype(np.float32)
    r, g, b = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2]
    mx = np.maximum(np.maximum(r, g), b)
    mn = np.minimum(np.minimum(r, g), b)
    sat = (mx - mn) / np.maximum(mx, 1.0)
    lum = 0.299 * r + 0.587 * g + 0.114 * b

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
    y0, y1, x0, x1 = int(ys.min()), int(ys.max()) + 1, int(xs.min()), int(xs.max()) + 1
    cropped = rgba[y0:y1, x0:x1]

    # Identify the smooth dark walnut interior cavity via flood-fill from exact center (preserves outer brass bevel & endcap diamonds!).
    ch, cw = cropped.shape[:2]
    clum = 0.299 * cropped[:, :, 0] + 0.587 * cropped[:, :, 1] + 0.114 * cropped[:, :, 2]
    # Dark interior is lum < 64; inner gold pinstripe & diamonds have lum > 78.
    dark_cand = (clum < 68.0) & (cropped[:, :, 3] > 240)
    cavity = np.zeros((ch, cw), dtype=bool)
    cq: deque[tuple[int, int]] = deque([(ch // 2, cw // 2)])
    cavity[ch // 2, cw // 2] = True
    while cq:
        cy, cx = cq.popleft()
        for ny, nx in ((cy - 1, cx), (cy + 1, cx), (cy, cx - 1), (cy, cx + 1)):
            if 0 <= ny < ch and 0 <= nx < cw and dark_cand[ny, nx] and not cavity[ny, nx]:
                cavity[ny, nx] = True
                cq.append((ny, nx))
    return Image.fromarray(cropped, "RGBA"), cavity


def make_framed_plaque(
    master_img: Image.Image,
    master_cavity: np.ndarray,
    out_w: int,
    out_h: int,
    style: str,
    shadow_rgba: tuple[int, int, int, float] = (8, 18, 18, 0.45),
    pad_x: int = 3,
    pad_top: int = 2,
    pad_bottom: int = 6,
    cap_ratio: float = 0.23,
    folder_tab: bool = False,
) -> Image.Image:
    """Create a spotless scalloped gold-beveled plaque/button/tab filled with authentic painted texture."""
    body_w = out_w - 2 * pad_x
    body_h = out_h - pad_top - pad_bottom
    pw, ph = master_img.size

    # Work at 2x target height for ultra-crisp bevel & anti-aliasing, then downsample cleanly.
    work_h = body_h * 2
    work_w = body_w * 2
    scale = work_h / ph
    scaled_w = round(pw * scale)
    scaled = master_img.resize((scaled_w, work_h), Image.Resampling.LANCZOS)
    cav_img = Image.fromarray((master_cavity.astype(np.uint8) * 255), "L").resize(
        (scaled_w, work_h), Image.Resampling.BILINEAR
    )

    cap = min(round(scaled_w * cap_ratio), work_w // 2 - 4)
    mid_w = max(2, work_w - 2 * cap)

    def hstretch(im: Image.Image) -> Image.Image:
        l_im = im.crop((0, 0, cap, work_h))
        r_im = im.crop((scaled_w - cap, 0, scaled_w, work_h))
        m_im = im.crop((cap, 0, scaled_w - cap, work_h)).resize((mid_w, work_h), Image.Resampling.LANCZOS)
        out = Image.new(im.mode, (work_w, work_h))
        out.paste(l_im, (0, 0))
        out.paste(m_im, (cap, 0))
        out.paste(r_im, (cap + mid_w, 0))
        return out

    base = hstretch(scaled)
    cav = np.array(hstretch(cav_img)).astype(np.float32) / 255.0
    # Smooth feathered inner transition so texture blends seamlessly beneath the gold inner pinstripe.
    cav_soft = np.array(
        Image.fromarray(np.clip(cav * 255, 0, 255).astype(np.uint8), "L").filter(ImageFilter.GaussianBlur(radius=2.2))
    ).astype(np.float32) / 255.0

    arr = np.array(base).astype(np.float32)

    if style == "vermilion":
        # Sample authentic painted vermilion damask lacquer texture from rematch.png interior!
        rem = load_orig("rematch")
        rw, rh = rem.size
        tex = rem.crop((int(rw * 0.14), int(rh * 0.24), int(rw * 0.86), int(rh * 0.76))).resize(
            (work_w, work_h), Image.Resampling.LANCZOS
        )
        tarr = np.array(tex)[:, :, :3].astype(np.float32)
        # Subtle warm studio lighting (brighter upper-center satin glow, rich crimson inner-rim vignette).
        yy = np.linspace(-1.0, 1.0, work_h)[:, None]
        xx = np.linspace(-1.0, 1.0, work_w)[None, :]
        glow = 1.06 - 0.10 * (yy + 0.15) ** 2 - 0.08 * (xx ** 2)
        tarr = np.clip(tarr * glow[:, :, None], 0, 255)
        # Keep the endcap diamonds gleaming warm gold by gently warming non-cavity frame too.
        arr[:, :, :3] = arr[:, :, :3] * (1.0 - cav_soft[:, :, None]) + tarr * cav_soft[:, :, None]

    elif style == "ivory":
        # Sample authentic painted warm antique ivory damask parchment texture from friend/close.png interior!
        cl = load_orig("close")
        cw, ch = cl.size
        # Take clean left/right damask parchment strips (avoiding central text) and mirror-tile seamlessly!
        left_strip = cl.crop((int(cw * 0.11), int(ch * 0.22), int(cw * 0.29), int(ch * 0.78)))
        tile = Image.new("RGBA", (left_strip.width * 2, left_strip.height))
        tile.paste(left_strip, (0, 0))
        tile.paste(left_strip.transpose(Image.Transpose.FLIP_LEFT_RIGHT), (left_strip.width, 0))
        tex = tile.resize((work_w, work_h), Image.Resampling.LANCZOS)
        tarr = np.array(tex)[:, :, :3].astype(np.float32)
        yy = np.linspace(-1.0, 1.0, work_h)[:, None]
        xx = np.linspace(-1.0, 1.0, work_w)[None, :]
        # Warm soft ivory sheen with delicate golden-tan inner border depth.
        shade = 1.02 - 0.06 * (yy + 0.15) ** 2 - 0.05 * (xx ** 2)
        tarr = np.clip(tarr * shade[:, :, None], 0, 255)
        arr[:, :, :3] = arr[:, :, :3] * (1.0 - cav_soft[:, :, None]) + tarr * cav_soft[:, :, None]

    elif style == "parchment-tab":
        # Muted warm aged parchment-tan for inactive deduction notebook tabs (clear visual hierarchy vs active crimson!).
        cl = load_orig("close")
        cw, ch = cl.size
        left_strip = cl.crop((int(cw * 0.11), int(ch * 0.22), int(cw * 0.29), int(ch * 0.78)))
        tile = Image.new("RGBA", (left_strip.width * 2, left_strip.height))
        tile.paste(left_strip, (0, 0))
        tile.paste(left_strip.transpose(Image.Transpose.FLIP_LEFT_RIGHT), (left_strip.width, 0))
        tex = tile.resize((work_w, work_h), Image.Resampling.LANCZOS)
        tarr = np.array(tex)[:, :, :3].astype(np.float32)
        # Gently warm-darken toward antique kraft parchment (#D8BE93) so it recedes softly behind active vermilion tab.
        tarr[:, :, 0] *= 0.89
        tarr[:, :, 1] *= 0.87
        tarr[:, :, 2] *= 0.83
        # Slightly soften the outer gold rim brightness too so active tab pops unmistakably!
        frame_muted = arr[:, :, :3] * 0.86 + np.array([28.0, 20.0, 12.0]) * 0.14
        arr[:, :, :3] = frame_muted * (1.0 - cav_soft[:, :, None]) + tarr * cav_soft[:, :, None]

    elif style == "walnut":
        # Rich espresso-walnut with subtle warm sheen (already authentic from source-master.jpg!).
        pass

    if folder_tab:
        # Gently soften bottom corners slightly less notched? Actually scalloped twin plaques look super cohesive!
        pass

    assembled = Image.fromarray(np.clip(np.round(arr), 0, 255).astype(np.uint8), "RGBA").resize(
        (body_w, body_h), Image.Resampling.LANCZOS
    )

    canvas = Image.new("RGBA", (out_w, out_h), (0, 0, 0, 0))
    sr, sg, sb, sa = shadow_rgba
    if sa > 0:
        sh_a = assembled.getchannel("A").point(lambda v: round(v * sa))
        sh_layer = Image.new("RGBA", (out_w, out_h), (0, 0, 0, 0))
        sh_fill = Image.new("RGBA", (body_w, body_h), (sr, sg, sb, 255))
        sh_fill.putalpha(sh_a)
        sh_layer.paste(sh_fill, (pad_x, pad_top + 3), sh_fill)
        sh_layer = sh_layer.filter(ImageFilter.GaussianBlur(radius=2.6))
        canvas = Image.alpha_composite(canvas, sh_layer)

    fg = Image.new("RGBA", (out_w, out_h), (0, 0, 0, 0))
    fg.paste(assembled, (pad_x, pad_top), assembled)
    return Image.alpha_composite(canvas, fg)


def extract_bright_lettering(
    src_name: str,
    crop_frac: tuple[float, float, float, float],
    lum_lo: float = 155.0,
    lum_hi: float = 215.0,
    add_shadow: bool = True,
) -> Image.Image:
    """Extract crisp bright gold/cream embossed calligraphy or icon from an original dark/vermilion button."""
    im = load_orig(src_name)
    w, h = im.size
    x0, y0, x1, y1 = int(w * crop_frac[0]), int(h * crop_frac[1]), int(w * crop_frac[2]), int(h * crop_frac[3])
    crop = im.crop((x0, y0, x1, y1))
    arr = np.array(crop).astype(np.float32)
    r, g, b = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2]
    # Bright cream/gold text has high green & blue channels compared to dark brown or deep vermilion red!
    # Use a luminance + green-lift metric that cleanly rejects vermilion lacquer (high R, low G/B).
    score = 0.25 * r + 0.55 * g + 0.20 * b
    alpha = smoothstep(lum_lo, lum_hi, score) * (arr[:, :, 3] / 255.0)

    # Clean edge colors toward luminous warm cream-gold so no dark/red fringe leaks onto new background.
    clean_rgb = arr[:, :, :3].copy()
    bright_ref = np.array([255.0, 238.0, 198.0], dtype=np.float32)
    edge_fix = smoothstep(0.85, 0.15, alpha)[:, :, None]
    clean_rgb = clean_rgb * (1.0 - edge_fix * 0.45) + bright_ref[None, None, :] * (edge_fix * 0.45)

    out = np.zeros_like(arr, dtype=np.uint8)
    out[:, :, :3] = np.clip(np.round(clean_rgb), 0, 255).astype(np.uint8)
    out[:, :, 3] = np.clip(np.round(alpha * 255.0), 0, 255).astype(np.uint8)
    glyph = Image.fromarray(out, "RGBA")
    ys, xs = np.where(out[:, :, 3] > 20)
    glyph = glyph.crop((int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1))
    if not add_shadow:
        return glyph

    pad = 4
    w2, h2 = glyph.size[0] + pad * 2, glyph.size[1] + pad * 2
    sh = Image.new("RGBA", (w2, h2), (0, 0, 0, 0))
    sh_fill = Image.new("RGBA", glyph.size, (32, 12, 4, 255))
    sh_fill.putalpha(glyph.getchannel("A").point(lambda v: round(v * 0.58)))
    sh.paste(sh_fill, (pad, pad + 2), sh_fill)
    sh = sh.filter(ImageFilter.GaussianBlur(radius=1.5))
    fg = Image.new("RGBA", (w2, h2), (0, 0, 0, 0))
    fg.paste(glyph, (pad, pad), glyph)
    return Image.alpha_composite(sh, fg)


def extract_dark_lettering(
    src_name: str,
    crop_frac: tuple[float, float, float, float],
    lum_hi: float = 160.0,
    lum_lo: float = 85.0,
) -> Image.Image:
    """Extract crisp dark espresso lettering/icon from a light parchment button."""
    im = load_orig(src_name)
    w, h = im.size
    x0, y0, x1, y1 = int(w * crop_frac[0]), int(h * crop_frac[1]), int(w * crop_frac[2]), int(h * crop_frac[3])
    crop = im.crop((x0, y0, x1, y1))
    arr = np.array(crop).astype(np.float32)
    lum = 0.299 * arr[:, :, 0] + 0.587 * arr[:, :, 1] + 0.114 * arr[:, :, 2]
    alpha = smoothstep(lum_hi, lum_lo, lum) * (arr[:, :, 3] / 255.0)

    ink_rgb = np.array([46.0, 22.0, 8.0], dtype=np.float32)
    out = np.zeros_like(arr, dtype=np.uint8)
    out[:, :, :3] = np.clip(np.round(ink_rgb), 0, 255).astype(np.uint8)
    out[:, :, 3] = np.clip(np.round(alpha * 255.0), 0, 255).astype(np.uint8)
    ys, xs = np.where(out[:, :, 3] > 20)
    return Image.fromarray(out[int(ys.min()):int(ys.max()) + 1, int(xs.min()):int(xs.max()) + 1], "RGBA")


def recolor_glyph_to_ink(glyph: Image.Image, ink=(62, 34, 15)) -> Image.Image:
    """Convert a bright gold icon+text layer cleanly into crisp antique espresso ink (for inactive parchment tabs)."""
    a = glyph.getchannel("A")
    out = Image.new("RGBA", glyph.size, (*ink, 255))
    out.putalpha(a)
    return out


def composite_centered(bg: Image.Image, fg: Image.Image, max_w_frac: float, max_h_frac: float, dy: int = 0) -> Image.Image:
    bw, bh = bg.size
    fw, fh = fg.size
    scale = min((bw * max_w_frac) / fw, (bh * max_h_frac) / fh)
    nw, nh = max(1, round(fw * scale)), max(1, round(fh * scale))
    fg_s = fg.resize((nw, nh), Image.Resampling.LANCZOS)
    layer = Image.new("RGBA", (bw, bh), (0, 0, 0, 0))
    layer.paste(fg_s, ((bw - nw) // 2, (bh - nh) // 2 + dy), fg_s)
    return Image.alpha_composite(bg, layer)


def build_wechat_invite_button() -> Image.Image:
    """Craft a bespoke vintage tabletop jade-emerald WeChat Invite button matching friend/copy.png silhouette."""
    copy_img = load_orig("copy")
    arr = np.array(copy_img).astype(np.float32)
    h, w = arr.shape[:2]
    r, g, b, a = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2], arr[:, :, 3]

    # Sample spotless unpainted damask filigree texture from rematch.png (zero text ghosts ever!)
    rem = load_orig("rematch")
    rw, rh = rem.size
    rem_tex = rem.crop((int(rw * 0.14), int(rh * 0.24), int(rw * 0.86), int(rh * 0.76))).resize(
        (w, h), Image.Resampling.LANCZOS
    )
    rt = np.array(rem_tex)[:, :, :3].astype(np.float32)
    # Extract subtle damask luminance modulation around 1.0
    rt_l = 0.299 * rt[:, :, 0] + 0.587 * rt[:, :, 1] + 0.114 * rt[:, :, 2]
    damask_mod = np.clip(rt_l / max(float(rt_l.mean()), 1.0), 0.86, 1.14)

    # Create a completely clean interior mask inside copy.png's rounded gold bevel rim.
    yy = np.linspace(-1.0, 1.0, h)[:, None]
    xx = np.linspace(-1.0, 1.0, w)[None, :]
    # Build rounded interior pill mask matching copy.png's inner gold pinstripe (inset ~14px x, ~13px y)
    mask_im = Image.new("L", (w, h), 0)
    md = ImageDraw.Draw(mask_im)
    md.rounded_rectangle((17, 15, w - 18, h - 18), radius=24, fill=255)
    inner_soft = np.array(mask_im.filter(ImageFilter.GaussianBlur(radius=3.0))).astype(np.float32) / 255.0

    # Shift copy.png's outer bevel rim smoothly from terracotta to antique jade-emerald while keeping gold pinstripe & cream shadow!
    red_dom = r - g
    g_ratio = g / np.maximum(r, 1.0)
    lacquer_w = smoothstep(32.0, 72.0, red_dom) * smoothstep(0.68, 0.48, g_ratio)
    lvl = np.clip((r - 65.0) / 165.0, 0.0, 1.0)
    rim_r = 12.0 + lvl * 34.0
    rim_g = 56.0 + lvl * 80.0
    rim_b = 35.0 + lvl * 52.0

    emerald = arr.copy()
    emerald[:, :, 0] = r * (1.0 - lacquer_w) + rim_r * lacquer_w
    emerald[:, :, 1] = g * (1.0 - lacquer_w) + rim_g * lacquer_w
    emerald[:, :, 2] = b * (1.0 - lacquer_w) + rim_b * lacquer_w

    # Paint completely clean, rich vintage jade-emerald damask lacquer inside the interior (zero text ghosting!).
    glow = 1.06 - 0.14 * (yy + 0.18) ** 2 - 0.06 * (xx ** 2)
    base_jade = np.zeros((h, w, 3), dtype=np.float32)
    base_jade[:, :, 0] = np.clip(26.0 * glow * damask_mod, 0, 255)
    base_jade[:, :, 1] = np.clip(116.0 * glow * damask_mod, 0, 255)
    base_jade[:, :, 2] = np.clip(73.0 * glow * damask_mod, 0, 255)

    # Preserve copy.png's delicate corner filigree lines on the far left/right (x < 16% or x > 84%) by keeping filigree highlights
    # while fully replacing the text zone [15%..85%].
    emerald[:, :, :3] = emerald[:, :, :3] * (1.0 - inner_soft[:, :, None]) + base_jade * inner_soft[:, :, None]

    # Add a delicate warm champagne-gold inner pinstripe matching copy.png's vintage craft!
    pinstripe_im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    pd = ImageDraw.Draw(pinstripe_im)
    pd.rounded_rectangle((15, 13, w - 16, h - 16), radius=25, outline=(228, 194, 122, 130), width=2)

    btn = Image.fromarray(np.clip(np.round(emerald), 0, 255).astype(np.uint8), "RGBA")
    btn = Image.alpha_composite(btn, pinstripe_im)

    # Extract authentic WeChat double-chat-bubble icon from profile/wechat.png and render in luminous warm cream-ivory!
    wx_icon_dark = extract_dark_lettering("wechat", (0.14, 0.18, 0.30, 0.84), lum_hi=175.0, lum_lo=95.0)
    wx_a = wx_icon_dark.getchannel("A")
    wx_ivory = Image.new("RGBA", wx_icon_dark.size, (255, 246, 224, 255))
    wx_ivory.putalpha(wx_a)

    icon_h = round(h * 0.44)
    icon_w = round(wx_ivory.width * (icon_h / wx_ivory.height))
    wx_s = wx_ivory.resize((icon_w, icon_h), Image.Resampling.LANCZOS)

    sh_fill = Image.new("RGBA", (icon_w, icon_h), (6, 30, 18, 255))
    sh_fill.putalpha(wx_s.getchannel("A").point(lambda v: round(v * 0.58)))
    sh_layer = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    ix = round(w * 0.115)
    iy = round((h - icon_h) / 2) - 2
    sh_layer.paste(sh_fill, (ix, iy + 2), sh_fill)
    sh_layer = sh_layer.filter(ImageFilter.GaussianBlur(radius=1.4))

    fg_layer = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    fg_layer.paste(wx_s, (ix, iy), wx_s)
    btn = Image.alpha_composite(btn, sh_layer)
    btn = Image.alpha_composite(btn, fg_layer)
    return btn


def main() -> None:
    ensure_originals()
    master_img, master_cavity = extract_master_plaque()

    results: dict[str, tuple[tuple[int, int], float]] = {}

    # 1. Learning header plaques (title-online, title-friend, title-hub, title-tutorial) + clean 9-slice banner
    for name, (w, h), crop in [
        ("title-online", (410, 86), (0.14, 0.14, 0.86, 0.86)),
        ("title-friend", (410, 80), (0.14, 0.10, 0.86, 0.90)),
        ("title-hub", (410, 86), (0.11, 0.12, 0.89, 0.88)),
        ("title-tutorial", (410, 86), (0.14, 0.12, 0.86, 0.88)),
    ]:
        plaque = make_framed_plaque(
            master_img, master_cavity, w, h, "walnut",
            shadow_rgba=(68, 42, 16, 0.34), pad_x=4, pad_top=2, pad_bottom=6, cap_ratio=0.22,
        )
        text = extract_bright_lettering(name, crop, lum_lo=135.0, lum_hi=195.0, add_shadow=True)
        out = composite_centered(plaque, text, 0.68, 0.62, dy=-2)
        p = ORIG_SOURCES[name]
        results[name] = (out.size, save_quantized(out, p))

    # Clean 9-sliceable banner.png (zero beige outer rectangle, rich dark-walnut & burnished gold frame!)
    banner = make_framed_plaque(
        master_img, master_cavity, 240, 84, "walnut",
        shadow_rgba=(68, 42, 16, 0.28), pad_x=3, pad_top=2, pad_bottom=5, cap_ratio=0.22,
    )
    results["banner"] = (banner.size, save_quantized(banner, ORIG_SOURCES["banner"]))

    # 2. Result buttons: match.png (重新匹配), result-home.png (返回大厅), rematch.png (blank vermilion)
    match_bg = make_framed_plaque(
        master_img, master_cavity, 368, 110, "vermilion",
        shadow_rgba=(4, 16, 16, 0.50), pad_x=4, pad_top=3, pad_bottom=8, cap_ratio=0.21,
    )
    match_txt = extract_bright_lettering("match", (0.24, 0.24, 0.76, 0.76), lum_lo=165.0, lum_hi=222.0, add_shadow=True)
    match_out = composite_centered(match_bg, match_txt, 0.56, 0.48, dy=-2)
    results["match"] = (match_out.size, save_quantized(match_out, ORIG_SOURCES["match"]))

    home_bg = make_framed_plaque(
        master_img, master_cavity, 362, 110, "ivory",
        shadow_rgba=(4, 16, 16, 0.50), pad_x=4, pad_top=3, pad_bottom=8, cap_ratio=0.21,
    )
    home_txt = extract_dark_lettering("result-home", (0.22, 0.24, 0.78, 0.74), lum_hi=155.0, lum_lo=75.0)
    home_out = composite_centered(home_bg, home_txt, 0.55, 0.45, dy=-2)
    results["result-home"] = (home_out.size, save_quantized(home_out, ORIG_SOURCES["result-home"]))

    rematch_out = make_framed_plaque(
        master_img, master_cavity, 767, 149, "vermilion",
        shadow_rgba=(4, 16, 16, 0.50), pad_x=6, pad_top=4, pad_bottom=10, cap_ratio=0.19,
    )
    results["rematch"] = (rematch_out.size, save_quantized(rematch_out, ORIG_SOURCES["rematch"]))

    # 3. Friend room WeChat invite button: assets/resources/art/friend/invite.png (+ .meta)
    invite_out = build_wechat_invite_button()
    invite_path = ROOT / "assets/resources/art/friend/invite.png"
    results["invite"] = (invite_out.size, save_quantized(invite_out, invite_path))
    ensure_meta(invite_path, ROOT / "assets/resources/art/friend/copy.png.meta")

    # 4. Deduction notebook tabs (active vermilion-gold + inactive parchment-bronze) & return.png
    for tab_name, crop in [
        ("tab-positions", (0.12, 0.16, 0.85, 0.84)),
        ("tab-history", (0.16, 0.15, 0.86, 0.84)),
    ]:
        glyph_bright = extract_bright_lettering(tab_name, crop, lum_lo=115.0, lum_hi=175.0, add_shadow=True)
        glyph_raw = extract_bright_lettering(tab_name, crop, lum_lo=122.0, lum_hi=180.0, add_shadow=False)
        glyph_ink = recolor_glyph_to_ink(glyph_raw, ink=(62, 32, 12))

        tab_on_bg = make_framed_plaque(
            master_img, master_cavity, 320, 78, "vermilion",
            shadow_rgba=(72, 46, 18, 0.30), pad_x=3, pad_top=2, pad_bottom=6, cap_ratio=0.20,
        )
        tab_on = composite_centered(tab_on_bg, glyph_bright, 0.72, 0.62, dy=-2)
        results[tab_name] = (tab_on.size, save_quantized(tab_on, ORIG_SOURCES[tab_name]))

        tab_off_bg = make_framed_plaque(
            master_img, master_cavity, 320, 78, "parchment-tab",
            shadow_rgba=(72, 46, 18, 0.18), pad_x=3, pad_top=2, pad_bottom=6, cap_ratio=0.20,
        )
        tab_off = composite_centered(tab_off_bg, glyph_ink, 0.70, 0.58, dy=-2)
        off_path = ROOT / f"assets/resources/art/learning-v2/{tab_name}-off.png"
        results[tab_name + "-off"] = (tab_off.size, save_quantized(tab_off, off_path))
        ensure_meta(off_path, ROOT / "assets/resources/art/learning-v2/tab-positions.png.meta")

    ret_bg = make_framed_plaque(
        master_img, master_cavity, 414, 106, "vermilion",
        shadow_rgba=(72, 46, 18, 0.36), pad_x=4, pad_top=3, pad_bottom=8, cap_ratio=0.20,
    )
    ret_txt = extract_bright_lettering("return", (0.14, 0.22, 0.86, 0.78), lum_lo=120.0, lum_hi=178.0, add_shadow=True)
    ret_out = composite_centered(ret_bg, ret_txt, 0.72, 0.56, dy=-2)
    results["return"] = (ret_out.size, save_quantized(ret_out, ORIG_SOURCES["return"]))

    # Build verification contact sheets on BOTH dark teal felt (#0D4750) and warm parchment (#F3E2C0)!
    showcase = [
        ("title-online", ORIG_SOURCES["title-online"]),
        ("title-friend", ORIG_SOURCES["title-friend"]),
        ("match", ORIG_SOURCES["match"]),
        ("result-home", ORIG_SOURCES["result-home"]),
        ("invite", invite_path),
        ("copy (ref)", ORIG_SOURCES["copy"]),
        ("tab-positions", ORIG_SOURCES["tab-positions"]),
        ("tab-positions-off", ROOT / "assets/resources/art/learning-v2/tab-positions-off.png"),
        ("tab-history", ORIG_SOURCES["tab-history"]),
        ("tab-history-off", ROOT / "assets/resources/art/learning-v2/tab-history-off.png"),
        ("return", ORIG_SOURCES["return"]),
        ("banner", ORIG_SOURCES["banner"]),
    ]
    for bg_hex, out_name in [("#0D4750", "preview-felt.png"), ("#F2DFBC", "preview-parchment.png")]:
        cols = 2
        cell_w, cell_h = 460, 140
        rows = (len(showcase) + 1) // 2
        sheet = Image.new("RGBA", (cols * cell_w + 40, rows * cell_h + 40), bg_hex)
        for idx, (_, path) in enumerate(showcase):
            im = Image.open(path).convert("RGBA")
            r_i, c_i = divmod(idx, cols)
            x = 20 + c_i * cell_w + (cell_w - im.width) // 2
            y = 20 + r_i * cell_h + (cell_h - im.height) // 2
            sheet.paste(im, (x, y), im)
        sheet.convert("RGB").save(DESIGN_DIR / out_name)

    manifest = {
        "note": "Reconstructed unified transparent-contour UI assets from pristine turn-plaque master & painted repo textures (image-generator quota temporarily exhausted).",
        "assets": {k: {"size": list(sz), "kb": round(kb, 1)} for k, (sz, kb) in results.items()},
    }
    (DESIGN_DIR / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")
    for k, (sz, kb) in results.items():
        print(f"  {k:20s}: {sz[0]:3d}x{sz[1]:<3d}  {kb:5.1f} KB")


if __name__ == "__main__":
    main()
