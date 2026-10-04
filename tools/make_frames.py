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


save(close_eye(close_eye(src.copy(), 'left'), 'right'), 'prenses-blink.jpg')
save(close_eye(src.copy(), 'right', happy=True), 'prenses-wink.jpg')
print('ok')
