"""Generate a labelled synthetic test set of SPECIMEN ID cards.

These are deliberately generic, watermarked mock cards (no emblems, logos or real
templates). They exercise every fraud scenario in the brief so you can demo and measure
the pipeline before real anonymised samples arrive.

    python scripts/generate_samples.py                 # cartoon portraits
    python scripts/generate_samples.py --faces ~/faces # paste real face photos (enables face checks)

Writes samples/*.jpg and samples/manifest.json.
"""
from __future__ import annotations

import argparse
import io
import json
import math
import random
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from app.pipeline.aadhaar_qr import build_secure_payload  # noqa: E402
from app.pipeline.validators import verhoeff_generate  # noqa: E402

OUT = Path(__file__).resolve().parent.parent / "samples"
FONT_DIR = Path("/usr/share/fonts/truetype/dejavu")
random.seed(7)


def font(size: int, bold: bool = False):
    for name in (["DejaVuSans-Bold.ttf"] if bold else ["DejaVuSans.ttf"]):
        p = FONT_DIR / name
        if p.exists():
            return ImageFont.truetype(str(p), size)
    for cand in ("Arial Bold.ttf" if bold else "Arial.ttf", "arialbd.ttf" if bold else "arial.ttf"):
        try:
            return ImageFont.truetype(cand, size)
        except OSError:
            continue
    return ImageFont.load_default()


def aadhaar_number(seed: str) -> str:
    rnd = random.Random(seed)
    base = str(rnd.randint(2, 9)) + "".join(str(rnd.randint(0, 9)) for _ in range(10))
    return base + verhoeff_generate(base)


def fmt_aadhaar(n: str) -> str:
    return f"{n[:4]} {n[4:8]} {n[8:]}"


def portrait(size=(190, 230), face_img: Image.Image | None = None, hue=0) -> Image.Image:
    if face_img is not None:
        f = face_img.convert("RGB")
        r = size[0] / size[1]
        w, h = f.size
        if w / h > r:
            nw = int(h * r); f = f.crop(((w - nw) // 2, 0, (w - nw) // 2 + nw, h))
        else:
            nh = int(w / r); f = f.crop((0, (h - nh) // 2, w, (h - nh) // 2 + nh))
        return f.resize(size, Image.LANCZOS)
    img = Image.new("RGB", size, (214, 222, 230))
    d = ImageDraw.Draw(img)
    skin = [(233, 196, 160), (201, 150, 110), (160, 110, 80)][hue % 3]
    d.ellipse((45, 150, 145, 260), fill=(70, 90, 120))
    d.ellipse((55, 40, 135, 140), fill=skin)
    d.chord((50, 30, 140, 100), 180, 360, fill=(40, 30, 30))
    d.ellipse((75, 80, 85, 90), fill=(30, 30, 30)); d.ellipse((105, 80, 115, 90), fill=(30, 30, 30))
    d.arc((80, 100, 110, 120), 20, 160, fill=(120, 60, 60), width=2)
    return img


def base_card(size=(1000, 630), tint=(236, 242, 248)) -> Image.Image:
    img = Image.new("RGB", size, tint)
    d = ImageDraw.Draw(img)
    # fine guilloche-style background lines (cards are never flat colour)
    for i in range(0, size[0], 14):
        d.arc((i - 300, -200, i + 300, 400), 0, 180, fill=(tint[0] - 8, tint[1] - 6, tint[2] - 4))
    return img


def watermark(img: Image.Image) -> Image.Image:
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    d.text((40, img.size[1] - 34), "SPECIMEN - SYNTHETIC TEST CARD - NOT A VALID DOCUMENT",
           font=font(16), fill=(150, 40, 40, 200))
    return Image.alpha_composite(img.convert("RGBA"), layer).convert("RGB")


def qr_image(payload: str, size: int = 220) -> Image.Image:
    enc = cv2.QRCodeEncoder.create()
    q = enc.encode(payload)
    q = cv2.resize(q, (size, size), interpolation=cv2.INTER_NEAREST)
    return Image.fromarray(q).convert("RGB")


def aadhaar_card(name, dob, gender, number, face=None, qr_dob=None, qr=True, hue=0,
                 yob_only=False) -> Image.Image:
    img = base_card()
    d = ImageDraw.Draw(img)
    d.rectangle((0, 0, 1000, 70), fill=(255, 153, 51))
    d.rectangle((0, 70, 1000, 80), fill=(19, 136, 8))
    d.text((300, 18), "Government of India", font=font(34, True), fill=(20, 20, 20))
    img.paste(portrait(face_img=face, hue=hue), (40, 120))
    x = 260
    d.text((x, 130), name, font=font(34, True), fill=(10, 10, 10))
    if yob_only:
        d.text((x, 190), f"Year of Birth : {dob[-4:]}", font=font(30), fill=(10, 10, 10))
    else:
        d.text((x, 190), f"DOB : {dob}", font=font(30), fill=(10, 10, 10))
    d.text((x, 245), gender.title(), font=font(30), fill=(10, 10, 10))
    d.text((280, 450), fmt_aadhaar(number), font=font(56, True), fill=(10, 10, 10))
    d.rectangle((260, 540, 960, 544), fill=(200, 30, 30))
    d.text((360, 552), "Aadhaar - Aam Aadmi ka Adhikar", font=font(24), fill=(60, 60, 60))
    if qr:
        payload = build_secure_payload(name, (qr_dob or dob).replace("/", "-"), gender[0].upper(), number[-4:])
        img.paste(qr_image(payload, 230), (735, 110))
    return watermark(img)


def pan_card(name, father, dob, pan, face=None, hue=0) -> Image.Image:
    img = base_card(tint=(226, 236, 246))
    d = ImageDraw.Draw(img)
    d.text((40, 30), "INCOME TAX DEPARTMENT", font=font(34, True), fill=(20, 40, 90))
    d.text((620, 30), "GOVT. OF INDIA", font=font(34, True), fill=(20, 40, 90))
    d.text((40, 110), "Permanent Account Number Card", font=font(26), fill=(20, 20, 20))
    d.text((40, 150), pan, font=font(44, True), fill=(10, 10, 10))
    d.text((40, 240), "Name", font=font(22), fill=(60, 60, 60))
    d.text((40, 270), name.upper(), font=font(32, True), fill=(10, 10, 10))
    d.text((40, 340), "Father's Name", font=font(22), fill=(60, 60, 60))
    d.text((40, 370), father.upper(), font=font(30), fill=(10, 10, 10))
    d.text((40, 440), "Date of Birth", font=font(22), fill=(60, 60, 60))
    d.text((40, 470), dob, font=font(32), fill=(10, 10, 10))
    img.paste(portrait(face_img=face, hue=hue), (760, 150))
    return watermark(img)


def college_card(name, college, roll, course, dob, valid, face=None, hue=0) -> Image.Image:
    img = base_card(tint=(242, 246, 238))
    d = ImageDraw.Draw(img)
    d.rectangle((0, 0, 1000, 110), fill=(24, 52, 110))
    d.text((40, 20), college, font=font(34, True), fill=(255, 255, 255))
    d.text((40, 68), "Student Identity Card", font=font(26), fill=(220, 230, 255))
    img.paste(portrait(face_img=face, hue=hue), (40, 150))
    x = 270
    rows = [("Name", name), ("Roll No", roll), ("Course", course), ("DOB", dob), ("Valid Upto", valid)]
    for i, (k, v) in enumerate(rows):
        d.text((x, 150 + i * 62), f"{k} : {v}", font=font(32, i == 0), fill=(10, 10, 10))
    d.text((720, 520), "Principal", font=font(24), fill=(60, 60, 60))
    return watermark(img)


# ---------------------------------------------------------------------------
# camera simulation & manipulations
# ---------------------------------------------------------------------------
def photograph(card: Image.Image, seed: int, angle: float = None, exif_make="samsung",
               exif_model="SM-A546E", software: str | None = None, quality=90) -> bytes:
    rnd = random.Random(seed)
    angle = rnd.uniform(-3, 3) if angle is None else angle
    bg = Image.new("RGB", (1280, 900), tuple(rnd.randint(60, 120) for _ in range(3)))
    bg = bg.filter(ImageFilter.GaussianBlur(2))
    c = card.rotate(angle, expand=True, resample=Image.BICUBIC, fillcolor=bg.getpixel((0, 0)))
    bg.paste(c, ((1280 - c.size[0]) // 2, (900 - c.size[1]) // 2))
    arr = np.asarray(bg).astype(np.float32)
    arr += np.random.default_rng(seed).normal(0, 2.0, arr.shape)  # sensor noise
    img = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))
    exif = Image.Exif()
    if exif_make:
        exif[271] = exif_make; exif[272] = exif_model
    if software:
        exif[305] = software
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=quality, exif=exif.tobytes())
    return buf.getvalue()


def blur(jpeg: bytes, k=19) -> bytes:
    img = Image.open(io.BytesIO(jpeg)).filter(ImageFilter.GaussianBlur(k / 3))
    buf = io.BytesIO(); img.save(buf, "JPEG", quality=85); return buf.getvalue()


def splice_text(jpeg: bytes, box, text, size=30, quality=95) -> bytes:
    """Simulate a Photoshop edit: paint over a field with fresh (never-compressed) text."""
    img = Image.open(io.BytesIO(jpeg)).convert("RGB")
    # re-render the patch at full quality, as an editor would
    patch = Image.new("RGB", (box[2] - box[0], box[3] - box[1]), (238, 243, 249))
    ImageDraw.Draw(patch).text((4, 2), text, font=font(size), fill=(0, 0, 0))
    img.paste(patch, box[:2])
    buf = io.BytesIO(); img.save(buf, "JPEG", quality=quality); return buf.getvalue()


def moire(jpeg: bytes) -> bytes:
    img = np.asarray(Image.open(io.BytesIO(jpeg)).convert("RGB")).astype(np.float32)
    h, w = img.shape[:2]
    yy, xx = np.mgrid[0:h, 0:w]
    theta = math.radians(12)
    grating = 0.82 + 0.18 * np.sin(2 * math.pi * (xx * math.cos(theta) + yy * math.sin(theta)) / 3.1)
    out = np.clip(img * grating[..., None], 0, 255).astype(np.uint8)
    buf = io.BytesIO(); Image.fromarray(out).save(buf, "JPEG", quality=90); return buf.getvalue()


def load_faces(folder: str | None) -> list[Image.Image | None]:
    if not folder:
        return [None] * 8
    files = sorted(p for p in Path(folder).expanduser().iterdir() if p.suffix.lower() in (".jpg", ".jpeg", ".png"))
    faces = [Image.open(p) for p in files]
    return (faces * 8)[:8] if faces else [None] * 8


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--faces", help="folder of face photos (≥2 different people recommended)")
    args = ap.parse_args()
    OUT.mkdir(exist_ok=True)
    F = load_faces(args.faces)
    cases = []

    def add(fname, data, event, form, expect, scenario, selfie=None):
        (OUT / fname).write_bytes(data)
        entry = {"file": fname, "event_id": event, "form": form, "expect": expect, "scenario": scenario}
        if selfie is not None:
            sf = fname.replace(".jpg", "_selfie.jpg")
            buf = io.BytesIO(); selfie.convert("RGB").save(buf, "JPEG", quality=92)
            (OUT / sf).write_bytes(buf.getvalue()); entry["selfie"] = sf
        cases.append(entry)

    n_priya, n_arjun, n_under, n_tamper = (aadhaar_number(s) for s in ("priya", "arjun", "under", "tamper"))
    priya_card = aadhaar_card("Priya Sharma", "14/03/2002", "female", n_priya, F[0], hue=0)
    priya_photo = photograph(priya_card, 1)

    # --- genuine -----------------------------------------------------------------
    add("01_aadhaar_genuine.jpg", priya_photo, "aibc-blr",
        {"name": "Priya Sharma", "email": "priya@example.com", "institution": ""}, "APPROVED", "genuine",
        selfie=F[0])
    add("02_aadhaar_genuine_name_variant.jpg",
        photograph(aadhaar_card("Arjun Ramesh", "02/11/2001", "male", n_arjun, F[1], hue=1), 2), "aibc-blr",
        {"name": "R. Arjun", "email": "arjun@example.com"}, "APPROVED", "genuine: initials on form",
        selfie=F[1])
    add("03_pan_genuine.jpg",
        photograph(pan_card("Rahul Verma", "Suresh Verma", "21/07/2000", "ABCPV1234K", F[2], hue=2), 3),
        "aibc-blr", {"name": "Rahul Verma", "email": "rahul@example.com"}, "APPROVED", "genuine")
    add("04_college_genuine.jpg",
        photograph(college_card("Neha Iyer", "RV College of Engineering", "1RV22CS104",
                                "B.E. Computer Science", "09/05/2004", "31/07/2027", F[3], hue=0), 4),
        "campus-hack", {"name": "Neha Iyer", "email": "neha@example.com",
                        "institution": "RV College of Engineering"}, "APPROVED", "genuine student")
    add("05_aadhaar_year_only.jpg",
        photograph(aadhaar_card("Farhan Shaikh", "01/01/1999", "male", aadhaar_number("farhan"), F[4], hue=1,
                                yob_only=True, qr=False), 5),
        "aibc-blr", {"name": "Mohd Farhan Shaikh", "email": "farhan@example.com"}, "APPROVED",
        "genuine: year-of-birth card, transliterated name")

    # --- fraud ----------------------------------------------------------------------
    tampered = aadhaar_card("Kabir Das", "18/08/2004", "male", n_tamper, F[5], qr_dob="18/08/2010", hue=2)
    add("06_aadhaar_dob_edited_qr_mismatch.jpg", photograph(tampered, 6), "aibc-blr",
        {"name": "Kabir Das", "email": "kabir@example.com"}, "NOT_APPROVED",
        "fraud: printed DOB edited, QR shows real (underage) DOB")
    genuine_minor = photograph(aadhaar_card("Ishaan Rao", "18/08/2010", "male", aadhaar_number("ishaan"),
                                            F[6], qr=False, hue=0), 7, angle=0, quality=80)
    add("07_aadhaar_dob_spliced.jpg", splice_text(genuine_minor, (397, 322, 700, 366), "DOB : 18/08/2004", 30),
        "aibc-blr", {"name": "Ishaan Rao", "email": "ishaan@example.com"}, "NOT_APPROVED",
        "fraud: DOB digits pasted over (ELA)")
    add("08_aadhaar_reused_other_name.jpg", photograph(priya_card, 8), "aibc-blr",
        {"name": "Karan Mehta", "email": "karan@example.com"}, "NOT_APPROVED",
        "fraud: Priya's Aadhaar reused by someone else")
    add("09_aadhaar_same_image_other_name.jpg", priya_photo, "campus-hack",
        {"name": "Sneha Kulkarni", "email": "sneha@example.com"}, "NOT_APPROVED",
        "fraud: identical image uploaded under another name")
    add("10_edited_in_photoshop.jpg",
        photograph(aadhaar_card("Vikram Nair", "30/01/2003", "male", aadhaar_number("vikram"), F[7], qr=False,
                                hue=1), 10, exif_make="", software="Adobe Photoshop 25.0"),
        "aibc-blr", {"name": "Vikram Nair", "email": "vikram@example.com"}, "NOT_APPROVED",
        "suspicious: saved by Photoshop")
    add("11_screen_recapture.jpg",
        moire(photograph(aadhaar_card("Ananya Ghosh", "12/12/2002", "female", aadhaar_number("ananya"),
                                      F[0], qr=False, hue=0), 11)),
        "aibc-blr", {"name": "Ananya Ghosh", "email": "ananya@example.com"}, "NOT_APPROVED",
        "suspicious: photo of a screen")
    bad_num = aadhaar_number("fake")[:-1] + str((int(aadhaar_number("fake")[-1]) + 3) % 10)
    add("12_invented_aadhaar_number.jpg",
        photograph(aadhaar_card("Rohit Jain", "05/06/2001", "male", bad_num, F[1], qr=False, hue=2), 12),
        "aibc-blr", {"name": "Rohit Jain", "email": "rohit@example.com"}, "NOT_APPROVED",
        "fraud: number fails Verhoeff checksum")
    add("13_name_mismatch.jpg",
        photograph(pan_card("Deepa Menon", "Ravi Menon", "11/09/1998", "BQRPM4821L", F[2], hue=0), 13),
        "aibc-blr", {"name": "Aditya Kapoor", "email": "aditya@example.com"}, "NOT_APPROVED",
        "fraud: someone else's PAN")

    # --- ineligible -----------------------------------------------------------------------
    add("14_underage_genuine.jpg",
        photograph(aadhaar_card("Meera Pillai", "22/02/2011", "female", n_under, F[3], hue=0), 14), "aibc-blr",
        {"name": "Meera Pillai", "email": "meera@example.com"}, "REJECTED", "ineligible: 15 years old")
    add("15_college_expired.jpg",
        photograph(college_card("Siddharth Rao", "PES University", "PES1UG20CS333", "B.Tech CSE",
                                "14/04/2002", "30/06/2024", F[4], hue=1), 15),
        "campus-hack", {"name": "Siddharth Rao", "email": "sid@example.com", "institution": "PES University"},
        "NOT_APPROVED", "student ID expired -> review, not reject")

    # --- participant can fix ------------------------------------------------------------------
    add("16_blurry.jpg", blur(photograph(aadhaar_card("Pooja Das", "03/03/2003", "female",
                                                      aadhaar_number("pooja"), F[5], hue=2), 16)),
        "aibc-blr", {"name": "Pooja Das", "email": "pooja@example.com"}, "RESUBMIT", "bad photo")
    add("17_pan_for_student_event.jpg",
        photograph(pan_card("Rahul Verma", "Suresh Verma", "21/07/2000", "ABCPV1234K", F[2], hue=2), 17),
        "campus-hack", {"name": "Rahul Verma", "email": "rahul@example.com"}, "RESUBMIT",
        "wrong document for student-only event")

    (OUT / "manifest.json").write_text(json.dumps({
        "events": {
            "aibc-blr": {"event_id": "aibc-blr", "name": "AI Build Challenge Bengaluru",
                         "event_date": "2026-09-18", "min_age": 18},
            "campus-hack": {"event_id": "campus-hack", "name": "Campus Hack (students only)",
                            "event_date": "2026-10-10", "min_age": 16, "student_only": True},
        },
        "cases": cases}, indent=2))
    print(f"wrote {len(cases)} cases to {OUT}")


if __name__ == "__main__":
    main()
