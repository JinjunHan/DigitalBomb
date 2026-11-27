"""Usage: python build-friend-digits.py /path/to/PlusJakartaSans[wght].ttf
Requires fonttools. Google Fonts upstream, SIL OFL 1.1; see resource directory license.
"""
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools import subset
from pathlib import Path
import sys

font = instantiateVariableFont(TTFont(sys.argv[1]), {'wght': 700}, inplace=True)
# Pin lining/tabular glyphs in cmap so Web/WeChat Canvas never depends on OpenType feature support.
cmap = font.getBestCmap()
for tag in ['lnum', 'tnum']:
    if 'GSUB' not in font:
        continue
    table = font['GSUB'].table
    for record in table.FeatureList.FeatureRecord:
        if record.FeatureTag != tag:
            continue
        for index in record.Feature.LookupListIndex:
            for sub in table.LookupList.Lookup[index].SubTable:
                mapping = getattr(sub, 'mapping', {})
                for c in range(48, 58):
                    if c in cmap and cmap[c] in mapping:
                        old = cmap[c]
                        new = mapping[old]
                        for entry in font['cmap'].tables:
                            if entry.isUnicode() and entry.cmap.get(c) == old:
                                entry.cmap[c] = new
                        cmap[c] = new

options = subset.Options()
options.layout_features = []
subsetter = subset.Subsetter(options=options)
subsetter.populate(text='0123456789/:—+- ')
subsetter.subset(font)

# Center vertical line-box metrics around the optical digit midpoint (~372/1000)
# so digits sit dead-center inside card slots, badges, and timers across Web & WeChat.
font['hhea'].ascent = 890
font['hhea'].descent = -150
font['hhea'].lineGap = 0
font['OS/2'].sTypoAscender = 890
font['OS/2'].sTypoDescender = -150
font['OS/2'].sTypoLineGap = 0
font['OS/2'].usWinAscent = 890
font['OS/2'].usWinDescent = 150

# Rename the modified subset rather than retain the original font family name.
for record in font['name'].names:
    if record.nameID in [1, 2, 3, 4, 6]:
        value = 'Bold' if record.nameID == 2 else 'FriendDigits'
        record.string = value.encode(record.getEncoding())

path = Path(__file__).resolve().parents[1] / 'assets/resources/fonts/friend-digits/FriendDigits.ttf'
font.save(path)
for c in range(48, 58):
    gname = font.getBestCmap()[c]
    g = font['glyf'][gname]
    adv, _ = font['hmtx'][gname]
    print(chr(c), f'w={adv}', g.yMin, g.yMax)
