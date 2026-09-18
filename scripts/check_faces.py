"""Check a folder of portraits before using it with generate_samples.py --faces.

The face demo fails quietly in ways that are hard to spot mid-pitch: a photo with no
detectable face makes the card carry a portrait the matcher cannot use, a group photo
makes it pick whichever face is largest, and two teammates who are matched against each
other are reported as ID reuse. This checks all of that up front.

    python scripts/check_faces.py ./my_faces

Exits non-zero if any photo is unusable, so it can gate a rehearsal script.

Consent: these are real people's faces. Only use photos the person agreed to, and delete
the folder after the event.
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from app.providers.face import get_face  # noqa: E402
from scripts.generate_samples import FACE_SLOTS  # noqa: E402

SUFFIXES = (".jpg", ".jpeg", ".png", ".webp")
MIN_FACE_PX = 80          # smaller than this and the embedding is unreliable
SAME_PERSON_SIMILARITY = 70  # matches FACE_MATCH_REVIEW: at or above this they may collide


def main() -> int:
    if len(sys.argv) != 2:
        print(__doc__)
        return 2
    folder = Path(sys.argv[1]).expanduser()
    if not folder.is_dir():
        print(f"not a folder: {folder}")
        return 2

    face = get_face()
    if face is None:
        print("No face provider. Run scripts/download_models.py, or set FACE_PROVIDER=local.")
        return 2

    files = sorted(p for p in folder.iterdir() if p.suffix.lower() in SUFFIXES)
    if not files:
        print(f"no images in {folder}")
        return 2

    problems = 0
    usable: list[tuple[Path, bytes]] = []
    for p in files:
        img = ImageOps.exif_transpose(Image.open(p)).convert("RGB")
        bgr = np.asarray(img)[:, :, ::-1].copy()
        boxes = face.detect(bgr) if hasattr(face, "detect") else []
        if not boxes:
            print(f"FAIL {p.name}: no face detected")
            problems += 1
            continue
        big = boxes[0]
        note = ""
        if len(boxes) > 1:
            note = f" ({len(boxes)} faces found; the largest is used)"
            problems += 1
        if min(big.w, big.h) < MIN_FACE_PX:
            print(f"FAIL {p.name}: face is only {big.w}x{big.h}px, needs {MIN_FACE_PX}px+")
            problems += 1
            continue
        print(f"{'WARN' if note else 'OK  '} {p.name}: face {big.w}x{big.h}px{note}")
        usable.append((p, p.read_bytes()))

    # Two teammates the matcher cannot tell apart would be reported as the same person.
    for i in range(len(usable)):
        for j in range(i + 1, len(usable)):
            try:
                sim = face.compare(usable[i][1], usable[j][1])
            except Exception:
                continue
            if sim is not None and sim >= SAME_PERSON_SIMILARITY:
                print(f"WARN {usable[i][0].name} and {usable[j][0].name} score {sim:.0f}/100 against "
                      "each other; they may be reported as the same person")
                problems += 1

    print()
    if len(usable) < FACE_SLOTS:
        print(f"note: {len(usable)} usable photo(s); {FACE_SLOTS} different people are needed so that no two "
              "genuine cases share a face")
    print(f"{len(usable)}/{len(files)} usable" + (f", {problems} issue(s)" if problems else ""))
    return 1 if problems else 0


if __name__ == "__main__":
    raise SystemExit(main())
