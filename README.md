# TrustGate: identity & eligibility verification for Hackingly

**PS-003 · AI Build Challenge Bengaluru**

Hackingly's current pipeline reads a date of birth from an ID. It can't tell whether that date is real, whether the ID belongs to the person registering, or whether the same ID was already used under another name.

TrustGate wraps that pipeline, without changing it, and returns one of four decisions for every registration, with a confidence score and plain-language reasons.

> **Core idea:** verification is a set of independent signals fused into a calibrated decision.
> Uncertainty goes to a human. It never becomes an automatic rejection.

| Decision | When |
|---|---|
| `APPROVED` | Consistent evidence and no concern on any key check |
| `NEEDS_REVIEW` | Anything uncertain or suspicious; an organizer decides in the dashboard |
| `REJECTED` | Only a **confidently read** DOB outside the age range, with nothing else casting doubt on it |
| `RESUBMIT` | Something the participant can fix: blurry photo, wrong document, missing selfie |

---

## Results on the labelled test set

`python scripts/evaluate.py` runs the full pipeline over 17 synthetic cases, one per scenario in the brief:

| Metric | Result |
|---|---|
| Genuine participants auto-approved | **5 / 5** (including initials-only and transliterated names, and year-only Aadhaar) |
| Genuine participants wrongly rejected | **0** |
| Fraud / suspicious IDs stopped before approval | **9 / 9** |
| Fraud auto-rejected without a human seeing it | **0** (a person always sees fraud) |
| Underage applicant rejected | 1 / 1 |
| Bad photo or wrong document sent back | 2 / 2 |
| Average check time (CPU, Tesseract) | ~1.6 s |

Each fraud case is caught by the detector designed for it: QR mismatch, JPEG ghost, ID reuse, image reuse, editing-software metadata, screen moiré, Verhoeff checksum, and name mismatch.

**Be honest about this in the pitch.** The thresholds were calibrated on this synthetic set. Re-run the same script on Hackingly's anonymised samples and re-tune the thresholds in `.env` before trusting the numbers. The harness exists precisely so this takes minutes.

---

## Quick start

```bash
# system deps: Tesseract + zbar
#   macOS:  brew install tesseract zbar
#   Ubuntu: sudo apt install tesseract-ocr libzbar0
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
python scripts/download_models.py        # offline face matching (optional)

python scripts/generate_samples.py       # 17 labelled specimen cards
python scripts/evaluate.py --keep-db     # measure + load them into the dashboard
pytest -q                                # 18 unit tests

uvicorn app.api:app --reload
# dashboard      http://localhost:8000/
# register form  http://localhost:8000/#/register
# API docs       http://localhost:8000/docs
```

Or run `docker compose up --build`.

**Face checks on samples:** the generated cards use cartoon portraits, so face checks show as "not checked". To demo face matching, run `python scripts/generate_samples.py --faces ./my_faces/` with photos of your teammates (with their consent). The selfie cases will then run the full face match and the face-reuse search.

### Production mode (AWS)

```bash
OCR_PROVIDER=textract       # Textract AnalyzeDocument + Queries; existing DOB pipeline wrapped
FACE_PROVIDER=rekognition   # CompareFaces + SearchFacesByImage collection
LLM_PROVIDER=bedrock        # optional: grounded field structuring + AI forensic notes
```

The IAM permissions are in `docs/iam-policy.json`, and the Hackingly integration contract is in [`docs/INTEGRATION.md`](docs/INTEGRATION.md).

---

## Architecture

```
registration form + ID photo (+ selfie)
  │
  ├─ 0  Quality gate ─ blur · glare · size ─────────────── fails → RESUBMIT (browser checks first)
  ├─ 1  OCR  (Textract | Tesseract)  +  EXISTING DOB PIPELINE (untouched, one vote)
  ├─ 2  Structuring ─ doc-type classifier + rule parser (+ LLM, grounded: values must exist in OCR text)
  ├─ 3  Aadhaar Secure QR ─ decode, parse, verify UIDAI signature
  ├─ 4  DOB resolution ─ vote across printed OCR, existing pipeline, QR  → value + confidence
  ├─ 5  Validators ─ Verhoeff checksum · PAN structure · date sanity · QR ↔ printed name/number
  ├─ 6  Forensics ─ JPEG ghosts · ELA heatmap · copy-move · screen moiré · EXIF · font consistency
  │                 · portrait present · (AI examiner, optional, low weight)
  ├─ 7  Duplicates ─ HMAC(ID no.) · strict image fingerprint · 1:N face search
  ├─ 8  Identity ─ Indian-name-aware matching · face match vs selfie
  ├─ 9  Eligibility rules ─ per event: age ON event date · student-only · accepted docs · institutions
  └─ 10 Fusion ─ decision + confidence + reasons + safe participant message
```

Every stage emits `Signal(name, category, severity, score, reason, weight)`. Fusion reads only signals, so **the reason an organizer sees is exactly the reason the engine used.** A check that couldn't run is `skipped` and is never penalised.

### Design choices that protect genuine participants

- **Three soft exits before any rejection.** A bad photo leads to RESUBMIT, and any doubt leads to NEEDS_REVIEW. REJECTED requires a DOB read with at least 85% confidence *and* no tamper, duplicate, or identity concerns.
- **A checksum failure is a warning, not a rejection.** A single misread digit also fails Verhoeff.
- **Indian names.** Initials ("R. Arjun" matches "Arjun Ramesh"), token order, dropped suffixes (Devi, Kumar), and transliteration variants (Mohd/Mohammed, Laxmi/Lakshmi) are all handled. A lone shared surname never counts as a match.
- **Year-only Aadhaar.** If the person is eligible at both possible ages, they're approved. If it's borderline, the case goes to review, never to rejection.
- **Returning participants.** The same ID and same person at another event is normal. Only the same ID under a *different* name is flagged.
- **Image-reuse detection is strict on purpose.** ID cards share templates, so loose hashing flags different people. I measured this: a different person's card came out *closer* than the same card re-photographed. Re-photographed cards are caught by the ID-number and face fingerprints instead.
- **Expired college ID** goes to review, since students are often between renewals.
- **The participant message never reveals fraud details**, so fraudsters don't learn which check caught them.
- **Fraud outranks "fixable".** A reused ID on the wrong document type goes to a human, not back to the fraudster with a retry prompt.

### Why the LLM never decides

The LLM only (a) fills fields the parser missed, where every value must appear in the OCR text or it is thrown away, and (b) adds a low-weight forensic note. Decisions come from deterministic, testable rules. This is the answer to "what if the AI hallucinates?"

### Tamper detection, strongest first

| Check | What it catches | Strength |
|---|---|---|
| Aadhaar Secure QR vs print | Edited DOB, name, or number; a forger can't re-sign the QR | **Very strong** (signed) |
| JPEG ghosts | Text pasted after the photo was first saved | Strong for splices |
| ID-number HMAC / face 1:N | The same ID or face under another name | Strong |
| Screen moiré (FFT) | A photo of someone else's ID on a screen | Medium |
| EXIF software tag | Saved by Photoshop, Canva, etc. | Medium |
| ELA heatmap | Visual aid for reviewers | Weak alone |
| Copy-move (ORB) | Cloned digits | Weak–medium |

---

## Privacy (DPDP Act 2023, UIDAI guidance)

- Full Aadhaar numbers are **never stored**. The system keeps only an HMAC fingerprint plus the last 4 digits.
- Stored images are **masked**: the first 8 Aadhaar digits are blacked out on the card *and* on the ELA heatmap, and old-format QR codes (which hold the full number) are blurred. Raw uploads are kept only if `KEEP_RAW_IMAGES=true`.
- Consent is required on every call. `DELETE /v1/verifications/{id}` erases the record, fingerprints, face embedding, and images.
- Every decision and override is written to an audit log.

---

## Project layout

```
app/
  api.py                  FastAPI service + webhooks
  db.py                   SQLite (portable SQL; swap for Postgres)
  config.py               env-driven providers and thresholds
  providers/              ocr.py (Textract/Tesseract) · legacy_dob.py · face.py · llm.py
  pipeline/               quality · extraction · aadhaar_qr · validators · tamper
                          duplicates · identity · rules · fusion · orchestrator
  static/                 dashboard + participant registration form (no build step)
scripts/                  generate_samples · evaluate · download_models
tests/                    unit tests
docs/                     INTEGRATION.md · iam-policy.json
```

---

## Venue plan (the final 20%)

1. Get Hackingly's anonymised samples. Add them to a manifest (same format as `samples/manifest.json`) and run `evaluate.py`.
2. Tune `BLUR_THRESHOLD`, `RECAPTURE_PEAK`, and `APPROVE_THRESHOLD` until genuine false rejects stay at 0.
3. Switch to `OCR_PROVIDER=textract` and wire in their real DOB function.
4. Add teammates' faces (with consent) to demo face match and face reuse.
5. Freeze features two hours before judging and rehearse the demo three times.

## 3-minute demo

1. **The problem:** "The current pipeline reads a DOB. It can't tell whether that DOB is real."
2. **Register form:** upload a blurry photo and get an instant retake prompt. Then a genuine card is approved in about 2 seconds.
3. **Review queue:**
   - *Kabir Das:* the printed DOB doesn't match the Aadhaar QR, and the QR shows he's 16.
   - *Ishaan Rao:* the DOB is highlighted in red because it lacks the JPEG compression trace the rest of the card has.
   - *Sneha Kulkarni:* "Also used by Priya Sharma."
   - Click **Approve** on one case to show the override landing in the audit log.
4. **Metrics:** 0 genuine participants rejected, 9/9 frauds stopped, and a human always sees fraud.
5. **Integration:** one API call, zero changes to the Textract pipeline, and webhooks.
6. **Roadmap:** DigiLocker-verified documents, Rekognition Face Liveness, and threshold learning from organizer overrides.

### Likely judge questions

- **"What stops a perfect forgery?"** Nothing image-based is perfect. That's why the signed Aadhaar QR is the anchor, and why DigiLocker is on the roadmap as ground truth.
- **"Won't this block real people?"** Only a confident, uncontested DOB can reject someone. Everything else goes to review, and we measure the false-reject rate on every change.
- **"Cost at scale?"** Textract Queries plus Rekognition cost a few rupees per registration. The quality gate stops bad photos before any paid call.
