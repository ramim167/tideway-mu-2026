"""Focused regression tests for audit-chain witness integrity."""
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from tideway.selftest import SHAPLA, _mandate, _ops
from tideway.service import Tideway

from tideway.store import Store


class AuditWitnessIntegrityTests(unittest.TestCase):
    business_id = "audit-witness-test"

    def setUp(self):
        self.tempdir = tempfile.TemporaryDirectory()
        root = Path(self.tempdir.name)
        self.db_path = root / "audit.sqlite3"
        self.witness_path = root / "audit.witness.json"
        self.store = Store(self.db_path, witness_path=self.witness_path)
        self.store.create_business(
            {
                "business_id": self.business_id,
                "name": "Audit Witness Test",
                "currency": "BDT",
                "opening_cash": "1000",
                "opening_date": "2026-10-01",
                "default_target_date": "2026-10-31",
                "country": "BD",
                "sector": "Test",
            },
            {"reserve_floor": "100", "action_limit": "100"},
        )

    def tearDown(self):
        self.tempdir.cleanup()

    def _cosign(self):
        result = self.store.witness_cosign(self.business_id)
        self.assertTrue(result["cosigned"])

    def test_first_time_without_witness_remains_valid(self):
        evidence = self.store.evidence(self.business_id)

        self.assertTrue(evidence["hash_chain_valid"])
        self.assertEqual(evidence["witness"], {"present": False})

    def test_valid_witness_is_consistent(self):
        self._cosign()

        evidence = self.store.evidence(self.business_id)

        self.assertTrue(evidence["hash_chain_valid"])
        self.assertTrue(evidence["witness"]["present"])
        self.assertTrue(evidence["witness"]["signature_valid"])
        self.assertTrue(evidence["witness"]["consistent"])

    def test_tampered_witness_signature_invalidates_hash_chain(self):
        self._cosign()
        witness = json.loads(self.witness_path.read_text())
        witness[self.business_id]["signature"] = "0" * 64
        self.witness_path.write_text(json.dumps(witness))

        evidence = self.store.evidence(self.business_id)

        self.assertFalse(evidence["hash_chain_valid"])
        self.assertFalse(evidence["witness"]["signature_valid"])
        self.assertFalse(evidence["witness"]["consistent"])
        self.assertIn("signature", evidence["witness"]["problem"].lower())

    def test_deleted_witness_invalidates_evidence(self):
        self._cosign()
        self.witness_path.unlink()

        evidence = self.store.evidence(self.business_id)

        self.assertFalse(evidence["hash_chain_valid"])
        self.assertFalse(evidence["witness"]["present"])
        self.assertFalse(evidence["witness"]["consistent"])
        self.assertIn("missing", evidence["witness"]["problem"].lower())

    def test_cosign_never_repairs_a_missing_or_corrupted_checkpoint(self):
        self._cosign()
        original = self.witness_path.read_bytes()
        self.witness_path.unlink()
        self.assertEqual(self.store.witness_cosign(self.business_id)["status"], "blocked")
        self.assertFalse(self.witness_path.exists())
        broken = json.loads(original)
        broken[self.business_id]["signature"] = "invalid"
        for content in (json.dumps(broken), "{", "{}", "null"):
            self.witness_path.write_text(content)
            self.assertEqual(self.store.witness_cosign(self.business_id)["status"], "blocked")
            self.assertEqual(self.witness_path.read_text(), content)

    def test_older_authentic_file_is_detected_after_checkpoint_advance(self):
        self._cosign()
        original = self.witness_path.read_bytes()
        self.store.audit(self.business_id, "review", "operator", "read", {})
        self._cosign()
        self.witness_path.write_bytes(original)
        self.assertFalse(self.store.evidence(self.business_id)["hash_chain_valid"])
        self.assertEqual(self.store.witness_cosign(self.business_id)["status"], "blocked")

    def test_parallel_processes_preserve_both_business_checkpoints(self):
        other = "second-test-business"
        self.store.create_business({"business_id": other, "name": "Second", "currency": "BDT",
                                    "opening_cash": "1000", "opening_date": "2026-10-01",
                                    "default_target_date": "2026-10-31"},
                                   {"reserve_floor": "100", "action_limit": "100"})
        code = ("from tideway.store import Store; import sys; "
                "s=Store(sys.argv[1], witness_path=sys.argv[2]); "
                "assert all(s.witness_cosign(sys.argv[3])['cosigned'] for _ in range(10))")
        procs = [subprocess.Popen([sys.executable, "-B", "-c", code, str(self.db_path), str(self.witness_path), key])
                 for key in (self.business_id, other)]
        for proc in procs:
            self.assertEqual(proc.wait(timeout=30), 0)
        for key in (self.business_id, other):
            self.assertTrue(self.store.evidence(key)["witness"]["consistent"])

    def test_failed_atomic_replace_preserves_previous_checkpoint(self):
        self._cosign()
        old = self.witness_path.read_bytes()
        self.store.audit(self.business_id, "review", "operator", "read", {})
        with mock.patch("tideway.store.os.replace", side_effect=OSError("disk full")):
            self.assertEqual(self.store.witness_cosign(self.business_id)["status"], "pending")
        self.assertEqual(self.witness_path.read_bytes(), old)
        self._cosign()

    def test_execute_persists_and_recovers_witness_on_same_key(self):
        app = Tideway(Path(self.tempdir.name) / "demo.sqlite3")
        _plan, mandate = _mandate(app)
        owner, _, _ = _ops(app)
        mid, key = mandate["mandate_id"], "recover-me"
        app.negotiate(SHAPLA, mid, "agent:test")
        with mock.patch.object(app.store, "_witness_write", side_effect=OSError("disk full")):
            first = app.store.execute(SHAPLA, mid, key, owner, "operator:test")
        self.assertEqual(first["status"], "executed")
        self.assertEqual(first["witness"]["status"], "pending")
        self.assertEqual(app.store.execution_by_key(SHAPLA, key)["receipt"], first)
        replay = app.store.execute(SHAPLA, mid, key, owner, "operator:test")
        self.assertTrue(replay["replayed"])
        self.assertTrue(replay["witness"]["cosigned"])
        self.assertEqual(replay["state_after"], first["state_after"])
        self.assertEqual(replay["receipt_id"], first["receipt_id"])
        stored = app.store.executions(SHAPLA)
        self.assertEqual(len(stored), 1)
        self.assertEqual(stored[0]["witness"], replay["witness"])
        self.assertEqual(app.store.execution_by_key(SHAPLA, key)["receipt"], stored[0])

    def test_truncated_audit_chain_invalidates_witness(self):
        self._cosign()
        with self.store.connect() as db:
            db.execute(
                "DELETE FROM audit WHERE business_id=? AND id=(SELECT MAX(id) FROM audit WHERE business_id=?)",
                (self.business_id, self.business_id),
            )

        evidence = self.store.evidence(self.business_id)

        self.assertFalse(evidence["hash_chain_valid"])
        self.assertTrue(evidence["witness"]["present"])
        self.assertTrue(evidence["witness"]["signature_valid"])
        self.assertFalse(evidence["witness"]["consistent"])
        self.assertIn("truncated", evidence["witness"]["problem"])


if __name__ == "__main__":
    unittest.main()
