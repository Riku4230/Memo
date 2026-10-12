# design/icon-original.png（灰色の背景に角丸のアイコンを描いた絵）から、
# design/icon-source.png（1024px 四方・角丸なし・全面の絵）を作る。一度きりの下ごしらえ。
# 使い方: python3 -I scripts/prepare-icon-source.py design/icon-original.png design/icon-source.png
# 角丸の外（灰色）は、内側の色をぼかして広げたもので埋める。縁の光沢も外す
import sys

import numpy as np
from PIL import Image, ImageDraw

src, out = sys.argv[1], sys.argv[2]
im = Image.open(src).convert('RGB')
a = np.asarray(im).astype(np.float32)
bg = a[5, 5]
inside = np.abs(a - bg).sum(axis=2) > 40
ys, xs = np.where(inside)
x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()

# 色で判定すると濃い葉の影まで外になるため、角丸の四角形を図形として作る（縁の光沢のぶん内側へ寄せる）
INSET, RADIUS = 16, 250
m = Image.new('L', im.size, 0)
ImageDraw.Draw(m).rounded_rectangle((x0 + INSET, y0 + INSET, x1 - INSET, y1 - INSET), RADIUS, fill=255)
mask = np.asarray(m) > 127

side = min(x1 - x0, y1 - y0) - 8
cx, cy = (x0 + x1) // 2, (y0 + y1) // 2
crop_box = (cx - side // 2, cy - side // 2, cx - side // 2 + side, cy - side // 2 + side)


def box(x, r):
    """縦横の移動平均（3回重ねてガウスぼかしに近づける）"""
    for _ in range(3):
        for axis in (0, 1):
            c = np.cumsum(np.pad(x, [(r + 1, r) if i == axis else (0, 0) for i in range(x.ndim)], mode='edge'), axis=axis)
            x = (np.take(c, range(2 * r + 1, c.shape[axis]), axis=axis) - np.take(c, range(0, c.shape[axis] - 2 * r - 1), axis=axis)) / (2 * r + 1)
    return x


# 外側を、内側の色をぼかして広げたもので埋める（ぼかしの大きさを変えながら外へ広げる）
filled = a.copy()
known = mask.astype(np.float32)
for r in [8, 16, 32, 64, 128]:
    acc = box(filled * known[..., None], r)
    w = box(known, r)
    est = acc / np.maximum(w, 1e-4)[..., None]
    upd = (known < 0.5) & (w > 0.02)
    filled[upd] = est[upd]
    known = np.where(upd, 1.0, known).astype(np.float32)

# 境目をなじませる
soft = box((mask * 1.0).astype(np.float32), 3)[..., None]
res = a * soft + filled * (1 - soft)
Image.fromarray(np.clip(res, 0, 255).astype(np.uint8)).crop(crop_box).resize((1024, 1024), Image.LANCZOS).save(out)
