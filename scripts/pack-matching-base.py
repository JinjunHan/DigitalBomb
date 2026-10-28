"""Package the reconstructed bare platform; preserve RGB, alpha and aspect ratio."""
from pathlib import Path
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
im=Image.open(ROOT/'docs/design/matching/base-reconstruction/generated.png').convert('RGBA')
im=im.crop(im.getchannel('A').getbbox());im.thumbnail((657,306),Image.Resampling.LANCZOS)
canvas=Image.new('RGBA',(657,306));canvas.alpha_composite(im,((657-im.width)//2,306-im.height))
canvas.save(ROOT/'assets/resources/art/matching/base.png',optimize=True)
