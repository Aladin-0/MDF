"""
Page-orientation detection for invoice photos (local, free, ~1 s).

Phone photos of bills are often taken sideways or upside down, and EXIF does
not always say so. Vision models read sideways tables noticeably worse — rows
get mixed up — so we straighten the image before sending it.

Method (RapidOCR, already a dependency of the local OCR path):
1. Detect text boxes on a downscaled copy. Mostly tall-and-narrow boxes mean
   the page is turned 90/270 degrees, otherwise 0/180.
2. Recognise the largest text lines in both candidate orientations and keep
   the one the recogniser reads with higher confidence.
"""
from __future__ import annotations

import logging
import threading

logger = logging.getLogger(__name__)

_ENGINE = None
_LOCK = threading.Lock()
DETECT_SIDE = 1280
SAMPLE_LINES = 12


def _engine():
    global _ENGINE
    with _LOCK:
        if _ENGINE is None:
            from rapidocr_onnxruntime import RapidOCR
            _ENGINE = RapidOCR()
        return _ENGINE


_TRANSPOSE_CW = {90: 'ROTATE_270', 180: 'ROTATE_180', 270: 'ROTATE_90'}   # PIL turns counter-clockwise


def rotate_cw(im, degrees: int):
    op = _TRANSPOSE_CW.get(int(degrees or 0) % 360)
    if not op:
        return im
    from PIL import Image
    return im.transpose(getattr(Image.Transpose, op))


def _box_dims(box):
    (x0, y0), (x1, y1), (x2, y2) = box[0], box[1], box[2]
    w = ((x1 - x0) ** 2 + (y1 - y0) ** 2) ** 0.5
    h = ((x2 - x1) ** 2 + (y2 - y1) ** 2) ** 0.5
    xs = [p[0] for p in box]
    ys = [p[1] for p in box]
    return w, h, (min(xs), min(ys), max(xs), max(ys))


def _rec_score(engine, crops) -> float:
    import numpy as np
    total = 0.0
    for c in crops:
        res, _ = engine(np.array(c.convert('RGB')), use_det=False, use_cls=False, use_rec=True)
        if not res:
            continue
        for item in res:
            text, score = (item[0], item[1]) if len(item) == 2 else (item[1], item[2])
            n = sum(ch.isalnum() for ch in str(text))
            total += float(score) * min(n, 20)
    return total


def detect_orientation(im) -> tuple:
    """
    Return (clockwise_degrees_to_make_upright, info). ``im`` is a PIL image
    already EXIF-transposed. Never raises: on any problem returns (0, {...}).
    """
    try:
        import numpy as np
        small = im.convert('L')
        scale = DETECT_SIDE / float(max(small.size))
        if scale < 1:
            small = small.resize((round(small.width * scale), round(small.height * scale)))
        engine = _engine()
        boxes, _ = engine(np.array(small.convert('RGB')), use_det=True, use_cls=False, use_rec=False)
        boxes = boxes or []
        dims = [_box_dims(b) for b in boxes]
        horizontal = sum(1 for w, h, _ in dims if w > 1.5 * h)
        vertical = sum(1 for w, h, _ in dims if h > 1.5 * w)
        if horizontal + vertical < 5:
            return 0, {'reason': 'too little text', 'boxes': len(dims)}
        sideways = vertical > horizontal
        candidates = (90, 270) if sideways else (0, 180)

        # Largest elongated text lines, cropped axis-aligned from the small image.
        lines = [d for d in dims if (d[1] > 2 * d[0] if sideways else d[0] > 2 * d[1])]
        lines.sort(key=lambda d: d[0] * d[1], reverse=True)
        crops = [small.crop(tuple(int(v) for v in d[2])) for d in lines[:SAMPLE_LINES]]
        if not crops:
            return (candidates[0], {'reason': 'no sample lines', 'h': horizontal, 'v': vertical})
        scores = {c: _rec_score(engine, [rotate_cw(cr, c) for cr in crops]) for c in candidates}
        best = max(scores, key=scores.get)
        return best, {'h': horizontal, 'v': vertical, 'scores': {k: round(v, 1) for k, v in scores.items()}}
    except Exception as exc:  # orientation is an optimisation, never a failure
        logger.warning('Orientation detection failed: %s', exc)
        return 0, {'error': str(exc)[:200]}
