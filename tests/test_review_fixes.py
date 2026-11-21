"""Regression tests for defects found in the independent review of 21 Nov 2026."""
from datetime import date
import json
import unittest
from unittest import mock

from tideway import ai_providers, inbox_rules
from tideway.agent import ProviderError, chat_to_responses
from tideway.ai_providers import Provider, make_transport
from tideway.currency_view import question
from tideway.domain import ValidationError, check_new_pin
from tideway.server import Application
from tideway.store import dhaka_day_utc_bounds

OWNER = {"id": "nadia", "name": "Nadia", "role": "owner"}


class Reply:
    def __init__(self, body): self.body = body
    def __enter__(self): return self
    def __exit__(self, *a): return False
    def read(self, *_): return self.body


def fake_provider(reply):
    """A provider transport that answers with `reply` and never touches the network."""
    body = json.dumps(reply).encode()
    patch = mock.patch.object(ai_providers, "open_provider_request", lambda request, timeout: Reply(body))
    return patch, make_transport([Provider("fake", "https://example.invalid/v1/chat/completions", "k", ["m"])])


class ReviewFixes(unittest.TestCase):
    def test_model_tool_arguments_never_trip_the_circuit_breaker(self):
        calls = [{"id": "c1", "type": "function",
                  "function": {"name": "project_cash", "arguments": json.dumps({"target_date": "2026-11-30"})}}]
        patch, transport = fake_provider({"choices": [{"message": {"content": None, "tool_calls": calls}}]})
        app = Application(":memory:", key="configured", model="m", transport=transport)
        self.addCleanup(app.store.close)
        plan = app.post("/api/plan/propose", {"business_id": "lotus-print"}, OWNER, None)
        with patch:
            app.post("/api/chat", {"business_id": "lotus-print", "message": "How is my cash flow?", "consent": True}, OWNER, None)
        self.assertFalse(app.store.snapshot("lotus-print")["policy"]["agent_paused"])
        self.assertEqual(app.store.plan("lotus-print", plan["plan_id"])["status"], "pending")

    def test_malformed_tool_calls_are_a_provider_error_not_a_crash(self):
        for calls in (["project_cash"], [{"function": "project_cash"}], "project_cash"):
            with self.subTest(calls=calls), self.assertRaises(ProviderError):
                chat_to_responses({"choices": [{"message": {"content": None, "tool_calls": calls}}]})

    def test_english_words_are_not_read_as_currency_codes(self):
        for text in ("Can I try 10 more days of credit?", "all 20 customers", "top 5 suppliers"):
            self.assertEqual(question(text, "BDT", "BDT"), text)
        self.assertEqual(question("Can I pay USD 10?", "BDT", "BDT"), "Can I pay BDT 1,220?")  # real codes still convert
        self.assertEqual(question("Can I pay usd 10?", "BDT", "BDT"), "Can I pay BDT 1,220?")

    def test_duplicates_inside_one_import_are_refused_cleanly(self):
        app = Application(":memory:")
        self.addCleanup(app.store.close)
        rec = {"record_type": "transaction", "date": "2026-10-05", "description": "Cash sale", "amount": "500",
               "currency": "BDT", "type": "income"}
        with self.assertRaisesRegex(ValidationError, "appears twice"):
            app.post("/api/inbox/confirm", {"business_id": "lotus-print", "records": [rec, dict(rec)]}, OWNER, None)

    def test_impossible_dates_are_skipped_not_fatal(self):
        text = "Received Tk 500 from Rahim on Feb 29\nReceived Tk 700 from Karim on 3 Nov\nReceived Tk 900 on 31/04"
        records = inbox_rules.extract(text, {"currency": "BDT"}, "2026-11-21")["records"]
        self.assertEqual([r["amount"] for r in records], [500, 700, 900])
        self.assertEqual([r["date"] for r in records], [None, "2026-11-03", None])

    def test_lab_challenge_rejects_a_non_text_customer(self):
        app = Application(":memory:")
        self.addCleanup(app.store.close)
        with self.assertRaises(ValidationError):
            app.post("/api/lab/challenge", {"business_id": "shapla-services", "kind": "delay", "customer": ["x"],
                                            "delay_days": 7}, OWNER, None)

    def test_new_pins_use_ascii_digits_only(self):
        self.assertEqual(check_new_pin("739215"), "739215")
        for pin in ("৭৩৯২১৫", "⁷³⁹²¹⁵", "73921a"):
            with self.subTest(pin=pin), self.assertRaises(ValidationError):
                check_new_pin(pin)

    def test_daily_caps_follow_the_dhaka_day(self):
        start, end = dhaka_day_utc_bounds()
        self.assertTrue(start.endswith("T18:00:00+00:00"))  # Dhaka midnight is 18:00 UTC the day before
        self.assertEqual(date.fromisoformat(end[:10]) - date.fromisoformat(start[:10]), date(2000, 1, 2) - date(2000, 1, 1))


if __name__ == "__main__":
    unittest.main()
