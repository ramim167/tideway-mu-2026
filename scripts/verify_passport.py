"""Verify a Tideway credit passport offline with an independently obtained issuer key.

    python scripts/verify_passport.py passport.json --public-key TRUSTED_HEX
"""
from __future__ import annotations

import argparse
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from tideway.credit_document import PASSPORT_MAX_BYTES, key_fingerprint, schema_error, validity_error, verify_public_signature
from tideway.domain import parse_strict_json


def check(document, expected_public_key=None, now=None):
    if not expected_public_key:
        return False, "Supply the issuer public key obtained through an independent trusted channel."
    error = schema_error(document)
    if error:
        return False, error
    if not verify_public_signature(document, expected_public_key):
        return False, "Signature does not match the expected issuer key."
    error = validity_error(document, now or datetime.now(timezone.utc))
    if error:
        return False, error["message"]
    fingerprint = key_fingerprint(bytes.fromhex(expected_public_key))
    return True, f"Signed passport claims verified against the supplied issuer key {fingerprint}. Valid until {document['expires_at']}."


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("passport", type=Path)
    parser.add_argument("--public-key", required=True, help="Trusted issuer public key (64 hex characters)")
    args = parser.parse_args(argv)
    try:
        with args.passport.open("rb") as source:
            raw = source.read(PASSPORT_MAX_BYTES + 1)
        if len(raw) > PASSPORT_MAX_BYTES:
            raise ValueError("Passport is too large.")
        document = parse_strict_json(raw.decode("utf-8"))
    except (OSError, ValueError, RecursionError) as exc:
        print(f"INVALID: Cannot read passport JSON ({exc}).")
        return 1
    ok, message = check(document, args.public_key)
    print(("VALID: " if ok else "INVALID: ") + message)
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
