"""Ed25519 public-key signatures on credit passports, verifiable offline by a lender."""
import copy
import hashlib
import io
import tempfile
from contextlib import redirect_stdout
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch
import unittest

from scripts import verify_passport as offline
from tideway import ed25519, security, treasury
from tideway.service import Tideway
from tideway.treasury import Treasury

OWNER = {"id": "nadia", "name": "Nadia Rahman", "role": "owner"}


class Ed25519Vectors(unittest.TestCase):
    def test_rfc8032_test_vector_1(self):
        secret = bytes.fromhex("9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60")
        public = ed25519.public_key(secret)
        self.assertEqual(public.hex(), "d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a")
        signature = ed25519.sign(secret, b"")
        self.assertEqual(signature.hex(), "e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e065224901555fb8821590a33bac"
                                          "c61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b")
        self.assertTrue(ed25519.verify(public, b"", signature))
        self.assertFalse(ed25519.verify(public, b"\x00", signature))
        self.assertFalse(ed25519.verify(public, b"", signature[:-1] + bytes([signature[-1] ^ 1])))
        self.assertFalse(ed25519.verify(public[:31], b"", signature))


    def test_identity_and_small_order_points_are_rejected_before_signature_equation(self):
        normal = ed25519.public_key(bytes(range(32)))
        identity = (1).to_bytes(32, "little")
        order_two = (2**255 - 20).to_bytes(32, "little")
        with patch.object(ed25519, "_sha512_modq", side_effect=AssertionError("weak point reached signature equation")):
            for point in (identity, order_two):
                with self.subTest(point=point):
                    self.assertFalse(ed25519.verify(point, b"test", normal + bytes(32)))
                    self.assertFalse(ed25519.verify(normal, b"test", point + bytes(32)))


class PassportPublicKey(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tideway = Tideway(":memory:")
        cls.treasury = Treasury(cls.tideway)
        cls.document = cls.treasury.issue_passport("shapla-services", OWNER, "operator:nadia")["passport"]
        cls.public_key = treasury.passport_public_key(cls.tideway.store.key)["public_key"]

    @classmethod
    def tearDownClass(cls):
        cls.tideway.store.close()

    def test_issued_passport_verifies_offline_with_public_key_only(self):
        ok, message = offline.check(self.document, self.public_key)
        self.assertTrue(ok, message)
        self.assertEqual(self.document["public_signature"]["public_key"], self.public_key)

    def test_server_reports_both_signatures_valid(self):
        result = self.treasury.verify_passport("shapla-services", self.document)
        self.assertTrue(result["valid"])
        self.assertTrue(result["public_signature_valid"])

    def test_any_edit_fails_offline_and_on_server(self):
        tampered = copy.deepcopy(self.document)
        tampered["health"]["score"] = 99
        self.assertFalse(offline.check(tampered, self.public_key)[0])
        self.assertEqual(self.treasury.verify_passport("shapla-services", tampered)["reason"], "signature_mismatch")

    def test_attacker_cannot_resign_with_their_own_key(self):
        forged = copy.deepcopy(self.document)
        forged["health"]["score"] = 99
        attacker = bytes(range(32))
        forged["public_signature"] = {**forged["public_signature"], "public_key": ed25519.public_key(attacker).hex(),
                                      "signature": ed25519.sign(attacker, treasury.public_message(forged)).hex()}
        self.assertFalse(offline.check(forged)[0])
        self.assertFalse(offline.check(forged, self.public_key)[0])
        self.assertEqual(self.treasury.verify_passport("shapla-services", forged)["reason"], "signature_mismatch")

    def test_cli_fingerprint_comes_from_trusted_key(self):
        document = copy.deepcopy(self.document)
        document["public_signature"]["key_id"] = "unsigned display label"
        ok, message = offline.check(document, self.public_key)
        self.assertTrue(ok, message)
        self.assertIn(hashlib.sha256(bytes.fromhex(self.public_key)).hexdigest()[:16], message)
        self.assertNotIn("unsigned display label", message)
        self.assertIn("Signed passport claims verified", message)
        self.assertFalse(offline.check(document)[0])

    def test_shared_schema_dates_and_clock_skew(self):
        now = datetime.now(timezone.utc)
        store_key = self.tideway.store.key
        cases = [
            ({"expires_at": now.replace(tzinfo=None).isoformat()}, "malformed"),
            ({"issued_at": "broken"}, "malformed"),
            ({"issued_at": (now + timedelta(minutes=6)).isoformat()}, "not_yet_valid"),
            ({"issued_at": (now + timedelta(minutes=4)).isoformat()}, "valid"),
            ({"expires_at": self.document["issued_at"]}, "malformed"),
            ({"issued_at": (now - timedelta(days=2)).isoformat(), "expires_at": now.isoformat()}, "expired"),
            ({"type": "Unknown"}, "malformed"), ({"additional": "field"}, "malformed"),
            ({"business": []}, "malformed"), ({"version": "unsupported"}, "malformed"),
            ({"as_of": "2026-02-29"}, "malformed"),
            ({"twcf": {}}, "malformed"),
            ({"breach_risk": {**self.document["breach_risk"], "runs": True}}, "malformed"),
            ({"health": {**self.document["health"], "components": [{}]}}, "malformed"),
            ({"limitations": "X" * treasury.PASSPORT_MAX_BYTES}, "malformed"),
        ]
        for fields, expected in cases:
            with self.subTest(fields=list(fields), expected=expected):
                document = copy.deepcopy(self.document)
                document.update(fields)
                document["public_signature"]["signature"] = ed25519.sign(
                    treasury.passport_signing_secret(store_key), treasury.public_message(document)).hex()
                document["signature"] = security.sign(treasury.passport_key(store_key), document)
                result = self.treasury.verify_passport("shapla-services", document, now=now)
                self.assertEqual(result["reason"], expected)
                self.assertEqual(offline.check(document, self.public_key, now=now)[0], result["valid"])

    def test_cli_returns_invalid_for_malformed_json(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "input.json"
            for raw in (b"{", b'{"a":1,"a":2}', b'{"n":NaN}', b'{"n":1e999}', b'"\\ud800"', b"\xff",
                        b"[" * 1100, b" " * (treasury.PASSPORT_MAX_BYTES + 1)):
                with self.subTest(raw=raw[:16]), redirect_stdout(io.StringIO()) as output:
                    path.write_bytes(raw)
                    self.assertEqual(offline.main([str(path), "--public-key", self.public_key]), 1)
                    self.assertIn("INVALID: Cannot read passport JSON", output.getvalue())

    def test_signing_key_is_purpose_bound(self):
        self.assertNotEqual(treasury.passport_signing_secret(self.tideway.store.key), treasury.passport_key(self.tideway.store.key))
        self.assertNotEqual(treasury.passport_signing_secret(self.tideway.store.key), self.tideway.store.key)


if __name__ == "__main__":
    unittest.main()
