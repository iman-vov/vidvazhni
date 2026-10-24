"""Hero busts for the New Game gallery: art/concepts/<id>/portrait.png with the flat grey backdrop
keyed out (flood fill from the edges), 360 px WebP in src/ui/game/assets/heroes/. Needs Pillow.

    python tools/hero-busts.py
"""
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'src/ui/game/assets/heroes'
HEROES = ['warden', 'wind-archer', 'herbalist', 'rogue', 'elementalist', 'tinker']
WORK, SIZE, TOLERANCE = 480, 360, 14


def bust(src: Path) -> Image.Image:
    im = Image.open(src).convert('RGB').resize((WORK, WORK), Image.LANCZOS)
    bg = im.getpixel((5, 5))
    diff = ImageChops.difference(im, Image.new('RGB', im.size, bg)).convert('L')
    mask = diff.point(lambda v: 0 if v < TOLERANCE else 255)
    seeds = [(x, y) for x in range(0, WORK, 6) for y in (0, WORK - 1)] + [(x, y) for y in range(0, WORK, 6) for x in (0, WORK - 1)]
    for p in seeds:
        if mask.getpixel(p) == 0:
            ImageDraw.floodfill(mask, p, 128)
    alpha = mask.point(lambda v: 0 if v == 128 else 255).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(1.2))
    out = im.convert('RGBA')
    out.putalpha(alpha)
    return out.resize((SIZE, SIZE), Image.LANCZOS)


if __name__ == '__main__':
    OUT.mkdir(parents=True, exist_ok=True)
    for hero in HEROES:
        path = OUT / f'{hero}.webp'
        bust(ROOT / 'art/concepts' / hero / 'portrait.png').save(path, 'WEBP', quality=82, method=6)
        print(path.relative_to(ROOT), path.stat().st_size)
