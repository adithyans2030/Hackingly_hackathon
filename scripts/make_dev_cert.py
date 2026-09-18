"""Generate a development signing key for Aadhaar Secure QR payloads.

The real Secure QR is signed by UIDAI, and TrustGate verifies that signature against
the certificate at UIDAI_CERT_PATH. In production that is UIDAI's public certificate.

Offline there is no way to produce a UIDAI-signed payload, so the sample generator
used to emit 256 zero bytes where the signature belongs. That left the single
strongest check in the pipeline permanently "not checked": the code was never
executed, so a regression in it would have gone unnoticed.

This script creates a self-signed *development* certificate. The sample generator
signs its payloads with the matching private key, and pointing UIDAI_CERT_PATH at
the certificate makes the real verification path run end to end.

    python scripts/make_dev_cert.py

The key never leaves this machine and is git-ignored. Swap UIDAI_CERT_PATH for
UIDAI's certificate in production and these dev-signed payloads stop verifying,
which is exactly the intended behaviour.
"""
from __future__ import annotations

import datetime as dt
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from app.pipeline.aadhaar_qr import DEV_CERT_PATH, DEV_KEY_PATH  # noqa: E402


def main() -> None:
    from cryptography import x509
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import rsa
    from cryptography.x509.oid import NameOID

    DEV_KEY_PATH.parent.mkdir(parents=True, exist_ok=True)

    # 2048-bit RSA with PKCS1v15 + SHA-256, matching the Secure QR signature format.
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    name = x509.Name([
        x509.NameAttribute(NameOID.COMMON_NAME, "TrustGate DEV Secure QR signer - NOT UIDAI"),
        x509.NameAttribute(NameOID.ORGANIZATION_NAME, "TrustGate development"),
    ])
    now = dt.datetime.now(dt.timezone.utc)
    cert = (
        x509.CertificateBuilder()
        .subject_name(name)
        .issuer_name(name)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - dt.timedelta(days=1))
        .not_valid_after(now + dt.timedelta(days=3650))
        .add_extension(x509.BasicConstraints(ca=False, path_length=None), critical=True)
        .sign(key, hashes.SHA256())
    )

    DEV_KEY_PATH.write_bytes(key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ))
    DEV_CERT_PATH.write_bytes(cert.public_bytes(serialization.Encoding.PEM))

    print(f"wrote {DEV_KEY_PATH}")
    print(f"wrote {DEV_CERT_PATH}")
    print("\nSet this in .env to verify dev-signed sample QRs:")
    print(f"  UIDAI_CERT_PATH={DEV_CERT_PATH.relative_to(ROOT).as_posix()}")


if __name__ == "__main__":
    main()
