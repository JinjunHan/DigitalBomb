"""Prepare licensed loops from official MP3s in a supplied directory (lobby.mp3/battle.mp3).
Usage: python3 scripts/prepare-bgm.py /path/to/originals
Requires ffmpeg. Originals are deliberately kept outside the repository.
"""
import array
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile

root = Path(__file__).resolve().parent.parent
source = Path(sys.argv[1])
rate = 32000
tracks = [('lobby', 82, 'Local Forecast - Elevator', 'USUAN1300012'),
          ('battle', 87, 'Sneaky Snitch', 'USUAN1100772')]
manifest = []
for name, bpm, title, isrc in tracks:
    original = source / (name + '.mp3')
    start = 8 * 60 / bpm
    count = round(16 * 4 * 60 / bpm * rate)
    overlap = round(.08 * rate)
    raw = subprocess.check_output(['ffmpeg', '-v', 'error', '-ss', str(start), '-i', str(original),
        '-t', str((count + overlap) / rate), '-ac', '1', '-ar', str(rate), '-f', 'f32le', '-'])
    samples = array.array('f', raw)
    if sys.byteorder != 'little': samples.byteswap()
    assert len(samples) >= count + overlap, 'Source is shorter than the loop'
    # Rotate by the overlap: the blended tail ends at the exact position at which the loop begins.
    output = samples[overlap:count]
    for i in range(overlap):
        mix = i / (overlap - 1)
        output.append(samples[count + i] * (1 - mix) + samples[i] * mix)
    if sys.byteorder != 'little': output.byteswap()
    target = root / 'assets/resources/audio' / ('music-' + name + '.mp3')
    with tempfile.TemporaryDirectory() as tmp:
        pcm = Path(tmp) / 'loop.f32'
        pcm.write_bytes(output.tobytes())
        subprocess.run(['ffmpeg', '-y', '-v', 'error', '-f', 'f32le', '-ar', str(rate), '-ac', '1',
            '-i', str(pcm), '-af', 'loudnorm=I=-20:TP=-2:LRA=7', '-ar', str(rate),
            '-c:a', 'libmp3lame', '-b:a', '48k', '-map_metadata', '-1',
            '-metadata', 'artist=Kevin MacLeod', '-metadata', 'title=' + title + ' (game loop)',
            '-metadata', 'copyright=CC BY 4.0; incompetech.com; excerpted, crossfaded, normalized, mono',
            str(target)], check=True)
    manifest.append(dict(file=target.name, title=title, artist='Kevin MacLeod', isrc=isrc,
        source='https://incompetech.com/music/royalty-free/index.html?isrc=' + isrc,
        license='https://creativecommons.org/licenses/by/4.0/', source_sha256=hashlib.sha256(original.read_bytes()).hexdigest(),
        start_seconds=start, loop_seconds=count / rate, crossfade_seconds=.08,
        changes='16-bar excerpt, circular crossfade, loudness normalization, mono 32 kHz / 48 kbps MP3'))
(root / 'docs/design/music-sources.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
