"""Visually-lossless PNG palette optimization for WeChat Mini-Game package budget.

Preserves exact pixel dimensions, atlas coordinates, .meta UUIDs, and transparent exteriors
(alpha == 0 stays strictly 0), requiring composite PSNR >= 37.0 dB on both dark and light
tabletop backgrounds before accepting any compressed candidate.
"""
from __future__ import annotations

import io
import math
import subprocess
from pathlib import Path
from PIL import Image, ImageChops, ImageStat

ROOT = Path(__file__).resolve().parents[1]
ART_DIR = ROOT / 'assets/resources/art'


def composite_psnr(original: Image.Image, candidate: Image.Image) -> tuple[float, float]:
    scores: list[float] = []
    for bg in ('#173E3C', '#fff4df'):
        base = Image.new('RGBA', original.size, bg)
        a = Image.alpha_composite(base, original).convert('RGB')
        b = Image.alpha_composite(base, candidate).convert('RGB')
        rms = ImageStat.Stat(ImageChops.difference(a, b)).rms
        mse = sum(v * v for v in rms) / 3.0
        scores.append(99.0 if mse == 0 else round(10.0 * math.log10((255.0 ** 2) / mse), 2))
    return scores[0], scores[1]


def quantize_png(raw: bytes, original: Image.Image, quality: str) -> bytes | None:
    proc = subprocess.run(
        ['pngquant', f'--quality={quality}', '--speed', '1', '--strip', '-'],
        input=raw,
        capture_output=True,
        check=False,
    )
    if proc.returncode != 0 or not proc.stdout:
        return None
    cand = proc.stdout
    decoded = Image.open(io.BytesIO(cand))
    if decoded.size != original.size:
        return None

    # Enforce strict alpha==0 preservation outside the original silhouette.
    orig_alpha = original.getchannel('A').tobytes()
    dec_rgba = decoded.convert('RGBA')
    dec_alpha = dec_rgba.getchannel('A').tobytes()
    if any(b != 0 for a, b in zip(orig_alpha, dec_alpha) if a == 0):
        # Fix palette transparency cleanly by reserving index 255 for transparent pixels.
        if decoded.mode == 'P':
            pal = list(decoded.getpalette('RGBA') or [])
            pal += [0] * (1024 - len(pal))
            pal[1020:1024] = [0, 0, 0, 0]
            px = bytearray(decoded.tobytes())
            for i, a in enumerate(orig_alpha):
                if a == 0:
                    px[i] = 255
            fixed = Image.frombytes('P', original.size, bytes(px))
            fixed.putpalette(pal, rawmode='RGBA')
            buf = io.BytesIO()
            fixed.save(buf, format='PNG', optimize=True)
            cand = buf.getvalue()
            dec_rgba = Image.open(io.BytesIO(cand)).convert('RGBA')
        else:
            return None

    dark_psnr, light_psnr = composite_psnr(original, dec_rgba)
    if min(dark_psnr, light_psnr) < 37.0:
        return None
    return cand


def main() -> None:
    before_total = 0
    after_total = 0
    optimized_count = 0
    top_savings: list[tuple[int, str, int, int]] = []

    for path in sorted(ART_DIR.rglob('*.png')):
        raw = path.read_bytes()
        orig_len = len(raw)
        before_total += orig_len
        if orig_len < 16 * 1024:
            after_total += orig_len
            continue

        im = Image.open(io.BytesIO(raw))
        orig_rgba = im.convert('RGBA')
        rel = str(path.relative_to(ROOT))
        # Keep crisp typography/glyph sheets at extra-high fidelity.
        quality = '85-98' if 'card-digits' in rel or 'digits' in rel else '75-95'
        best = quantize_png(raw, orig_rgba, quality)
        if best is None and quality == '75-95':
            best = quantize_png(raw, orig_rgba, '82-98')

        if best is not None and len(best) <= orig_len - 3 * 1024 and len(best) < orig_len * 0.94:
            path.write_bytes(best)
            after_total += len(best)
            optimized_count += 1
            top_savings.append((orig_len - len(best), rel, orig_len, len(best)))
        else:
            after_total += orig_len

    saved = before_total - after_total
    print(f'Optimized {optimized_count} PNG files in assets/resources/art/')
    print(f'PNG total: {before_total/1024/1024:.2f} MiB -> {after_total/1024/1024:.2f} MiB (saved {saved/1024/1024:.2f} MiB)')
    top_savings.sort(reverse=True)
    for diff, rel, b, a in top_savings[:15]:
        print(f'  -{diff/1024:6.1f} KB  ({b/1024:6.1f} -> {a/1024:6.1f} KB)  {rel}')


if __name__ == '__main__':
    main()
