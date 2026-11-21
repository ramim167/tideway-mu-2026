"""Shared validation for the issuer and offline lender credit-document verifiers."""
from __future__ import annotations

import hashlib
import json
from datetime import date, datetime, timedelta
from decimal import Decimal, InvalidOperation

from . import ed25519
from .domain import CURRENCIES, canonical_json

PASSPORT_VERSION = "tideway-credit-passport-v1"
PASSPORT_MAX_BYTES = 200_000
PASSPORT_FIELDS = ("type", "version", "passport_id", "issuer", "business", "as_of", "issued_at", "expires_at",
                   "snapshot_hash", "audit", "twcf", "health", "breach_risk", "limitations", "signature_alg", "public_signature",
                   "signature")


def key_fingerprint(public):
    return hashlib.sha256(public).hexdigest()[:16]


def _text(value):
    return isinstance(value, str) and bool(value.strip())


def _integer(value):
    return type(value) is int


def _count(value):
    return _integer(value) and value >= 0


def _numeric(value):
    if not (_integer(value) or _text(value)):
        return False
    try:
        return Decimal(value).is_finite()
    except InvalidOperation:
        return False


def _probability(value):
    return _numeric(value) and 0 <= Decimal(value) <= 1


def _day(value):
    if not _text(value):
        return False
    try:
        return date.fromisoformat(value).isoformat() == value
    except ValueError:
        return False


def _fields(section, **checks):
    return isinstance(section, dict) and all(check(section.get(name)) for name, check in checks.items())


def _financial_sections(document):
    if not _fields(document["issuer"], name=_text, key_id=_text, issued_by=_text):
        return False
    if not _fields(document["business"], business_id=_text, name=_text,
                   currency=lambda value: _text(value) and value in CURRENCIES, synthetic=lambda value: type(value) is bool):
        return False
    if not _fields(document["audit"], head_hash=_text, entries=_count, chain_valid=lambda value: type(value) is bool):
        return False
    twcf = document["twcf"]
    if not _fields(twcf, start_date=_day, end_date=_day, weeks=_count, reserve_floor_minor=_count):
        return False
    for scenario in ("scheduled", "likely", "stress"):
        if not _fields(twcf.get(scenario), opening_cash_minor=_integer, receipts_minor=_count, disbursements_minor=_count,
                       net_flow_minor=_integer, closing_cash_minor=_integer, lowest_cash_minor=_integer,
                       lowest_cash_date=_day, weeks_below_reserve=lambda value: isinstance(value, list) and all(_count(week) for week in value),
                       first_week_below_reserve=lambda value: value is None or _count(value)):
            return False
    health = document["health"]
    if not _fields(health, score=_numeric, band=_text, weights=lambda value: isinstance(value, dict) and value,
                   components=lambda value: isinstance(value, list) and value):
        return False
    if not all(_fields(item, id=_text, value=lambda v: v is None or _numeric(v),
                       score=lambda v: v is None or _numeric(v), weight=_numeric, formula=_text)
               for item in health["components"]):
        return False
    if any(item["id"] not in health["weights"] or not _numeric(health["weights"][item["id"]])
           for item in health["components"]):
        return False
    return _fields(document["breach_risk"], probability_breach=_probability, probability_payroll_unfunded=_probability,
                   runs=lambda value: _count(value) and value > 0, seed=_integer, horizon_end=_day)


def schema_error(document):
    if (not isinstance(document, dict) or set(document) != set(PASSPORT_FIELDS)
            or document.get("version") != PASSPORT_VERSION or document.get("type") != "TidewayCreditPassport"):
        return "Not a Tideway credit passport in the expected format."
    sections = ("issuer", "business", "audit", "twcf", "health", "breach_risk", "public_signature")
    if (not all(isinstance(document[name], dict) for name in sections)
            or not all(isinstance(document[name], str) and document[name] for name in PASSPORT_FIELDS if name not in sections)
            or not _day(document["as_of"]) or not _financial_sections(document)):
        return "Passport fields have invalid types or missing values."
    try:
        size = len(json.dumps(document, ensure_ascii=False, allow_nan=False, separators=(",", ":")).encode("utf-8"))
    except (ValueError, TypeError, RecursionError):
        return "Passport contains invalid JSON values."
    if size > PASSPORT_MAX_BYTES:
        return "Passport is too large."
    return None


def public_message(document):
    """Bytes covered by the Ed25519 signature: every field except the two signature fields."""
    body = {key: value for key, value in document.items() if key not in ("signature", "public_signature")}
    return canonical_json(body).encode("utf-8")


def verify_public_signature(document, expected_public_key):
    """Offline check a lender can run with only the issuer's public key (hex)."""
    block = document.get("public_signature") if isinstance(document, dict) else None
    if not isinstance(block, dict) or block.get("alg") != "Ed25519":
        return False
    try:
        public, signature = bytes.fromhex(block["public_key"]), bytes.fromhex(block["signature"])
    except (KeyError, TypeError, ValueError):
        return False
    if not isinstance(expected_public_key, str) or public.hex() != expected_public_key.lower():
        return False
    return ed25519.verify(public, public_message(document), signature)


def _parse(value):
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed if parsed.tzinfo else None


def validity_error(document, now):
    issued, expires = _parse(document.get("issued_at")), _parse(document.get("expires_at"))
    if issued is None or expires is None or expires <= issued:
        return {"reason": "malformed", "message": "Passport dates are invalid."}
    if expires <= now:
        return {"reason": "expired", "signature_valid": True, "expires_at": document["expires_at"],
                "message": f"The passport expired at {document['expires_at']}. Ask the business for a fresh one."}
    if issued > now + timedelta(minutes=5):
        return {"reason": "not_yet_valid", "signature_valid": True,
                "message": "The passport's issue time is in the future."}
    return None
