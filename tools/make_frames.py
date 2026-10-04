"""Blink and wink frames for the princess portrait.

The open eyes are covered with nearby skin and replaced by closed anime-style
lash lines. Output: www/img/prenses-blink.jpg and www/img/prenses-wink.jpg
(same size and framing as prenses.jpg so they can be swapped seamlessly).
Usage: python3 tools/make_frames.py <original 1254x1254 image>
"""
import sys
from PIL import Image, ImageDraw, ImageFilter

src = Image.open(sys.argv[1]).convert('RGB')
SCALE = 900 / src.width

# Eye geometry in original pixels: opening polygon, skin source offset, lash curve
EYES = {
    'left': dict(poly=[(538, 266), (556, 262), (580, 263), (602, 267), (616, 278), (614, 300), (590, 306), (552, 297), (540, 282)],
                 skin_dy=36, lid=[(536, 280), (552, 287), (572, 291), (594, 289), (610, 282)],
                 happy=[(538, 288), (556, 278), (574, 274), (592, 278), (606, 288)]),
    'right': dict(poly=[(680, 337), (700, 333), (722, 335), (744, 342), (748, 352), (740, 366), (712, 368), (690, 360), (680, 348)],
                  skin_dy=34, lid=[(678, 350), (694, 357), (714, 361), (734, 360), (750, 353)],
                  happy=[(680, 358), (698, 347), (716, 343), (734, 347), (750, 358)]),
}


def close_eye(img, eye, happy=False):
    g = EYES[eye]
    xs = [p[0] for p in g['poly']]
    ys = [p[1] for p in g['poly']]
    box = (min(xs) - 8, min(ys) - 6, max(xs) + 8, max(ys) + 8)
    # Skin patch from just below the eye, softened
    dy = g['skin_dy']
    patch = img.crop((box[0], box[1] + dy, box[2], box[3] + dy)).filter(ImageFilter.GaussianBlur(3))
    mask = Image.new('L', img.size, 0)
    ImageDraw.Draw(mask).polygon(g['poly'], fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(2.5)).crop(box)
    img.paste(patch, box[:2], mask)
    d = ImageDraw.Draw(img)
    line = g['happy'] if happy else g['lid']
    d.line(line, fill=(38, 22, 30), width=5, joint='curve')
    # A few lashes at the outer corner
    ox, oy = line[0] if eye == 'left' else line[-1]
    sign = -1 if eye == 'left' else 1
    for k in range(3):
        d.line([(ox, oy), (ox + sign * (7 + 3 * k), oy + 4 + 3 * k)], fill=(38, 22, 30), width=3)
    return img


def save(img, name):
    img.resize((900, 900), Image.LANCZOS).save(f'www/img/{name}', quality=84, optimize=True, progressive=True)


# Mouth line (upper/lower lip meeting line), from the left corner to the right corner
MOUTH = [(592, 398), (604, 402), (616, 407), (628, 412), (640, 417), (651, 423)]


def open_mouth(img, amount):
    """Opens the mouth by `amount` pixels: the lower lip moves down along the
    face's tilt and the gap shows a dark mouth with a hint of teeth."""
    import math
    (x0, y0), (x1, y1) = MOUTH[0], MOUTH[-1]
    L = math.hypot(x1 - x0, y1 - y0)
    nx, ny = -(y1 - y0) / L, (x1 - x0) / L  # perpendicular, pointing down-left
    if ny < 0:
        nx, ny = -nx, -ny
    # taper: no opening at the corners, full in the middle
    def taper(i):
        t = i / (len(MOUTH) - 1)
        return math.sin(math.pi * t) ** 0.6
    lower = [(x + nx * (amount * taper(i) + 3), y + ny * (amount * taper(i) + 3)) for i, (x, y) in enumerate(MOUTH)]
    # 1) move the lower lip down
    lip_poly = [(x + nx * 3, y + ny * 3) for (x, y) in MOUTH] + [(x + nx * 18, y + ny * 18) for (x, y) in reversed(MOUTH)]
    mask = Image.new('L', img.size, 0)
    ImageDraw.Draw(mask).polygon(lip_poly, fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(1.5))
    shifted = img.transform(img.size, Image.AFFINE, (1, 0, -nx * amount, 0, 1, -ny * amount), resample=Image.BICUBIC)
    shifted_mask = mask.transform(img.size, Image.AFFINE, (1, 0, -nx * amount, 0, 1, -ny * amount))
    out = img.copy()
    out.paste(shifted, (0, 0), shifted_mask)
    # 2) dark mouth interior between the upper lip line and the lowered lip
    d = ImageDraw.Draw(out)
    cavity = MOUTH + list(reversed(lower))
    d.polygon(cavity, fill=(84, 22, 34))
    # tongue hint near the bottom, teeth hint along the top
    tongue = [(x + nx * amount * taper(i) * 0.55, y + ny * amount * taper(i) * 0.55) for i, (x, y) in enumerate(MOUTH)]
    d.polygon(tongue[1:-1] + list(reversed(lower[1:-1])), fill=(170, 70, 84))
    teeth = [(x + nx * 3.2 * taper(i), y + ny * 3.2 * taper(i)) for i, (x, y) in enumerate(MOUTH)]
    d.polygon(MOUTH[1:-1] + list(reversed(teeth[1:-1])), fill=(246, 236, 236))
    d.line(MOUTH, fill=(70, 20, 30), width=2, joint='curve')
    # soften the edit so it blends with the painting
    region = (min(x for x, _ in MOUTH) - 6, min(y for _, y in MOUTH) - 6, max(x for x, _ in lower) + 8, max(y for _, y in lower) + 12)
    soft = out.crop(region).filter(ImageFilter.GaussianBlur(0.7))
    out.paste(soft, region[:2])
    return out


save(close_eye(close_eye(src.copy(), 'left'), 'right'), 'prenses-blink.jpg')
save(open_mouth(src, 5), 'prenses-talk1.jpg')
save(open_mouth(src, 10), 'prenses-talk2.jpg')
save(close_eye(src.copy(), 'right', happy=True), 'prenses-wink.jpg')
print('ok')
