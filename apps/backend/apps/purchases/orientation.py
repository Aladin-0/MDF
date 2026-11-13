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


# ---------------------------------------------------------------------------
# Row locating (for the review screen's per-row photo strips)
# ---------------------------------------------------------------------------
LOCATE_SIDE = 1800
MIN_MATCH = 75        # match score (0-100) a printed line must reach to be trusted


def _text_lines(im):
    """
    Printed lines on an upright page: RapidOCR boxes merged into rows by
    vertical overlap. Returns [(y0, x0, y1, x1, text)] in 0..1000 page units,
    top to bottom. Recognition is only used to *find* the line by fuzzy
    matching, never as the value that is read.
    """
    import numpy as np
    small = im.convert('L')
    scale = LOCATE_SIDE / float(max(small.size))
    if scale < 1:
        small = small.resize((round(small.width * scale), round(small.height * scale)))
    w, h = small.size
    res, _ = _engine()(np.array(small.convert('RGB')))
    cells = []
    for box, text, _score in (res or []):
        xs = [p[0] for p in box]
        ys = [p[1] for p in box]
        cells.append([min(ys), min(xs), max(ys), max(xs), str(text)])
    cells.sort(key=lambda c: (c[0] + c[2]) / 2)
    rows = []
    for c in cells:
        cy, ch = (c[0] + c[2]) / 2, c[2] - c[0]
        if rows:
            r = rows[-1]
            ry, rh = (r[0] + r[2]) / 2, r[2] - r[0]
            if abs(cy - ry) < 0.6 * max(min(ch, rh), 1):
                r[0], r[1], r[2], r[3] = min(r[0], c[0]), min(r[1], c[1]), max(r[2], c[2]), max(r[3], c[3])
                r[4].append((c[1], c[4]))
                continue
        rows.append([c[0], c[1], c[2], c[3], [(c[1], c[4])]])
    out = []
    for y0, x0, y1, x1, parts in rows:
        text = ' '.join(t for _, t in sorted(parts))
        out.append((round(y0 * 1000 / h), round(x0 * 1000 / w), round(y1 * 1000 / h), round(x1 * 1000 / w), text))
    # Height of one printed text line = median height of the individual word
    # boxes (a word is always one row tall, even on a tilted photo).
    word_heights = sorted((c[2] - c[0]) * 1000 / h for c in cells) or [0]
    _text_lines.word_height = word_heights[len(word_heights) // 2]
    return out


def locate_rows(image_bytes: bytes, items: list) -> list:
    """
    Snap each scanned row to the printed line it came from. ``items`` are
    normalised rows (name, batch_no, row_text, amount, box) of ONE page in bill
    order. Returns a box [y0, x0, y1, x1] (0..1000) per item, or None when no
    line matches confidently — a missing strip is better than a wrong one.
    Never raises.
    """
    try:
        import io
        from PIL import Image
        from rapidfuzz import fuzz
        lines = _text_lines(Image.open(io.BytesIO(image_bytes)))
    except Exception as exc:
        logger.warning('Row locating failed: %s', exc)
        return [None] * len(items)
    if not lines:
        return [None] * len(items)
    # A "line" much taller than the page's typical line is several rows merged
    # (tilted photo, or names printed offset from their numbers): a strip of it
    # would show two rows, so such lines are never used.
    typical = getattr(_text_lines, 'word_height', 0) or sorted(l[2] - l[0] for l in lines)[len(lines) // 2] or 1
    max_height = 1.7 * typical

    import re

    def compact(t):
        return re.sub(r'[^A-Z0-9.]', '', str(t or '').upper())

    def money_forms(v):
        try:
            f = float(v)
        except (TypeError, ValueError):
            return []
        return list({f'{f:.2f}', f'{f:g}'})

    def score(it, line_text):
        """0-100: name 35 + batch 35 + MRP/rate/amount 30, all space-insensitive."""
        line = compact(line_text)
        name = compact(it.get('name'))
        s_name = fuzz.partial_ratio(name, line) / 100.0 if len(name) >= 3 else 0.0
        batch = compact(it.get('batch_no'))
        s_batch = fuzz.partial_ratio(batch, line) / 100.0 if len(batch) >= 3 else None
        nums = [money_forms(it.get(k)) for k in ('mrp', 'rate', 'amount')]
        nums = [forms for forms in nums if forms]
        s_nums = (sum(1 for forms in nums if any(f in line for f in forms)) / len(nums)) if nums else None
        parts = [(35, s_name)]
        if s_batch is not None:
            parts.append((35, 1.0 if s_batch >= 0.95 else s_batch * 0.5))   # a different batch is strong evidence against
        if s_nums is not None:
            parts.append((30, s_nums))
        total_w = sum(w for w, _ in parts)
        return 100.0 * sum(w * v for w, v in parts) / total_w

    out, last = [], -1
    for it in items:
        best, best_score = None, 0.0
        for idx in range(last + 1, len(lines)):          # rows keep their printed order
            sc = score(it, lines[idx][4])
            hint = it.get('box')
            if hint:                                     # tiny nudge towards Gemini's rough position
                sc -= min(abs((lines[idx][0] + lines[idx][2]) / 2 - (hint[0] + hint[2]) / 2) / 50.0, 5)
            if sc > best_score:
                best, best_score = idx, sc
        if best is None or best_score < MIN_MATCH:
            out.append(None)
            continue
        y0, x0, y1, x1, _ = lines[best]
        last = best
        out.append([y0, x0, y1, x1] if (y1 - y0) <= max_height else None)
    return out
