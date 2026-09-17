# Plugging TrustGate into Hackingly's registration flow

TrustGate sits **beside** the existing Textract DOB pipeline. Nothing in that pipeline changes:
`app/providers/legacy_dob.py` calls it as-is and treats its DOB as one of several independent sources.

## 1. Point TrustGate at the existing pipeline

Pick one:

```python
# app/providers/legacy_dob.py  →  call_existing_pipeline()
from hackingly.ocr.dob import extract_dob      # in-process
return extract_dob(image_bytes)                 # must return {"dob": "...", "confidence": 0-100}
```

```bash
# or, if it runs as a service
LEGACY_DOB_URL=https://ocr.internal.hackingly.in/dob
```

With `OCR_PROVIDER=textract` and neither option set, TrustGate reproduces the pipeline's behaviour with a Textract `DOB` query.

## 2. Configure each event once

```bash
curl -X POST $TG/v1/events -H "X-API-Key: $KEY" -H "content-type: application/json" -d '{
  "event_id": "aibc-blr",
  "name": "AI Build Challenge Bengaluru",
  "event_date": "2026-09-18",
  "min_age": 18,
  "student_only": false,
  "accepted_docs": ["AADHAAR", "PAN", "COLLEGE_ID", "DRIVING_LICENCE", "VOTER_ID", "PASSPORT"],
  "require_selfie": false,
  "allowed_institutions": [],
  "webhook_url": "https://api.hackingly.in/hooks/trustgate"
}'
```

Age is always evaluated **on `event_date`**, not on the day of registration.

## 3. Call it from the registration handler

```bash
curl -X POST $TG/v1/verify -H "X-API-Key: $KEY" \
  -F event_id=aibc-blr -F name="Priya Sharma" -F email=priya@example.com \
  -F institution="RV College of Engineering" -F external_ref=REG-10293 \
  -F consent=true -F detail=false \
  -F id_image=@aadhaar.jpg -F selfie=@selfie.jpg
```

Node (the registration service):

```js
const fd = new FormData();
for (const [k, v] of Object.entries({ event_id, name, email, institution, external_ref: reg.id, consent: "true", detail: "false" }))
  fd.append(k, v);
fd.append("id_image", new Blob([idBuffer], { type: "image/jpeg" }), "id.jpg");
if (selfieBuffer) fd.append("selfie", new Blob([selfieBuffer], { type: "image/jpeg" }), "selfie.jpg");

const res = await fetch(`${TG}/v1/verify`, { method: "POST", headers: { "X-API-Key": KEY }, body: fd });
const v = await res.json();

switch (v.decision) {
  case "APPROVED":     await reg.confirm(); break;
  case "RESUBMIT":     return showRetry(v.participant_message);      // blurry photo, wrong document
  case "REJECTED":     await reg.decline(v.participant_message); break;
  case "NEEDS_REVIEW": await reg.markPending(v.verification_id); break; // organizer decides in the dashboard
}
```

### Response (`detail=false`)

```json
{
  "verification_id": "v_3f0c9a1b2d4e5f60",
  "event_id": "aibc-blr",
  "decision": "NEEDS_REVIEW",
  "confidence": 0.51,
  "summary": "Needs a quick human check. Date of birth printed on the card (2004-08-18) does not match the Aadhaar QR code (2010-08-18). The printed date may have been edited.",
  "reasons": ["Date of birth printed on the card ...", "Age on event day is 16; ..."],
  "participant_message": "Thanks! Your ID is being reviewed by the organizers. You'll hear back shortly.",
  "extracted": { "doc_type": "AADHAAR", "name": "Kabir Das", "dob": "2004-08-18", "id_number": "XXXX XXXX 4821", "...": "..." },
  "applicant": { "name": "Kabir Das", "email": "kabir@example.com", "external_ref": "REG-10293" }
}
```

`detail=true` (default) adds `signals`, `field_boxes`, `suspicious_regions`, `dob_resolution`, `aadhaar_qr`, `timings_ms` and artifact URLs.

| decision | meaning | what Hackingly should do |
|---|---|---|
| `APPROVED` | consistent evidence, no concerns on key checks | confirm registration |
| `NEEDS_REVIEW` | uncertain or suspicious | hold; organizer decides in TrustGate |
| `REJECTED` | confidently-read DOB outside the age range, nothing else in doubt | decline with `participant_message` |
| `RESUBMIT` | participant can fix it (photo quality, wrong document) | ask for a new upload |

`participant_message` never reveals fraud-detection details, so it is safe to show directly.

## 4. Async + webhooks (for high traffic)

Send `async_mode=true` → `202 {"verification_id", "status": "processing"}`. When done, and whenever an organizer
reviews a case, TrustGate POSTs to the event's `webhook_url` with header
`X-TrustGate-Signature: sha256=<hex HMAC of body with WEBHOOK_SECRET>`.

```python
import hmac, hashlib
def valid(body: bytes, header: str, secret: str) -> bool:
    good = "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(good, header)
```

## 5. Other endpoints

| method | path | purpose |
|---|---|---|
| POST | `/v1/quality-check` | instant blur/glare/size feedback before submit |
| GET | `/v1/verifications?event_id=&decision=&q=` | queue |
| GET | `/v1/verifications/{id}` | full result |
| POST | `/v1/verifications/{id}/review` | `{decision, note, reviewer}` human override (audited) |
| DELETE | `/v1/verifications/{id}` | right to erasure (record, fingerprints, face embedding, images) |
| GET | `/v1/metrics?event_id=` | automation rate, overrides, top flags, latency, test-set results |
| GET | `/v1/audit` | audit log |
| GET | `/docs` | OpenAPI UI |
