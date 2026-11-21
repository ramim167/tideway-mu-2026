"""Regression tests for the second independent review (inbox amounts, approvals, hosted demo, Scam Shield, planner)."""
import os
import tempfile
import unittest
from datetime import date

from tideway import inbox_rules, scam_shield
from tideway.domain import ValidationError, minor_value, parse_amount
from tideway.server import Application

PIN = "739215"
OWNER = {"id": "alice", "name": "Alice", "role": "owner"}
ACCOUNTANT = {"id": "bob", "name": "Bob", "role": "accountant"}


def blank_app(cash=10000, reserve=1000):
    app = Application(":memory:", seed=False)
    app.store.create_business({"business_id": "shop", "name": "Review Shop", "currency": "BDT", "opening_date": "2026-10-01",
                               "default_target_date": "2026-10-31", "opening_cash_minor": cash},
                              {"reserve_floor_minor": reserve, "action_limit_minor": 10**14, "daily_cap_minor": 10**14,
                               "dual_approval_threshold_minor": 10**14, "lookahead_days": 0})
    for operator in (OWNER, ACCOUNTANT):
        app.store.ensure_operator(operator["id"], operator["name"], operator["role"], PIN)
        app.store.ensure_membership("shop", operator["id"], operator["role"])
    return app


def post(app, path, body, who=OWNER):
    return app.post(path, {"business_id": "shop", **body}, who, None)


def extract(text, known=()):
    records = inbox_rules.extract(text, {"currency": "BDT"}, date(2026, 11, 21), known)["records"]
    return records[0] if records else None


class InboxParsing(unittest.TestCase):
    def test_reference_number_before_currency_is_not_the_amount(self):
        for text, amount, who in (("Rahim Store invoice INV-204 Tk 45,000 due 30 Nov", 45000, "Rahim Store"),
                                  ("Rahim Store invoice 204 Tk 45,000 due 30 Nov", 45000, "Rahim Store"),
                                  ("Dhaka Paper bill BL-88 Tk 12,000 due 5 Dec", 12000, "Dhaka Paper"),
                                  ("500 Tk received from Karim on 2026-10-05", 500, "Karim"),
                                  ("[WhatsApp] Bay Logistics: bhai 15000 taka 30/10 er moddhe dibo", 15000, "Bay Logistics")):
            with self.subTest(text=text):
                record = extract(text)
                self.assertEqual((record["amount"], record["counterparty"]), (amount, who))

    def test_known_names_match_whole_words_only(self):
        self.assertEqual(extract("Alif Store will pay Tk 500 on 2026-10-10", ("Ali",))["counterparty"], "Alif Store")
        self.assertEqual(extract("Ali will pay Tk 500 on 2026-10-10", ("Ali",))["counterparty"], "Ali")
        self.assertEqual(extract("Payment for quality goods received Tk 500 on 2026-10-10", ("Ali",))["counterparty"], "")

    def test_names_stop_before_currency_and_reference(self):
        self.assertEqual(extract("Bill from Dhaka Paper Tk 12,500 due 05/12/2026")["counterparty"], "Dhaka Paper")
        self.assertEqual(extract("Received Tk 8,000 from Karim Traders ref KT-77 on 20/11/2026")["counterparty"], "Karim Traders")

    def test_bkash_outgoing_and_bangla_alerts_are_read(self):
        send = extract("Send Money Tk 2,000.00 to 01911111111 successful. Fee Tk 5.00. Balance Tk 800.00. TrxID 7QQ1 at 21/11/2026 11:00")
        self.assertEqual((send["amount"], send["direction"]), (2000, "out"))
        pay = extract("Payment Tk 1,500.00 to Shopno Mart (01700000000) successful. Balance Tk 300.00. TrxID 7QQ2 at 21/11/2026 11:05")
        self.assertEqual((pay["amount"], pay["direction"], pay["counterparty"]), (1500, "out", "Shopno Mart"))
        bangla = extract("৳৫,০০০ পেয়েছেন করিম ট্রেডার্স থেকে ২০/১১/২০২৬")
        self.assertEqual((bangla["amount"], bangla["direction"], bangla["counterparty"]), (5000, "in", "করিম ট্রেডার্স"))

    def test_inbox_save_keeps_hidden_character_flag(self):
        app = blank_app()
        result = post(app, "/api/inbox/confirm", {"records": [{"record_type": "invoice", "id": "hidden", "customer": "Ac​me",
                                                               "currency": "BDT", "amount": "5", "due_date": "2026-10-05"}]})
        self.assertEqual(result["quarantined_text"][0]["flags"], ["hidden_characters"])
        self.assertIn("hidden_characters", app.store.records("shop")["invoices"][0]["risk_flags"])


class Approvals(unittest.TestCase):
    def test_payee_capitalisation_does_not_bypass_separation_of_duties(self):
        app = blank_app()
        post(app, "/api/inbox/confirm", {"records": [
            {"record_type": "bill", "id": "history", "payee": "Rahman Supplies", "payee_account": "OLD-1111", "currency": "BDT",
             "amount": "150", "due_date": "2026-09-01", "status": "paid"},
            {"record_type": "bill", "id": "changed", "payee": "Rahman Supplies", "payee_account": "NEW-2222", "currency": "BDT",
             "amount": "150", "due_date": "2026-11-30"}]})
        post(app, "/api/payee/verify", {"payee": "Rahman Supplies", "account": "NEW-2222", "method": "callback_number_on_file", "pin": PIN})
        post(app, "/api/inbox/confirm", {"records": [
            {"record_type": "bill", "id": "upper", "payee": "RAHMAN SUPPLIES", "payee_account": "NEW-2222", "currency": "BDT",
             "amount": "150", "due_date": "2026-10-10", "reschedule_allowed": True},
            {"record_type": "transaction", "id": "sale", "description": "Cash sale", "type": "income", "currency": "BDT",
             "amount": "200", "date": "2026-10-12"}]})
        plan = post(app, "/api/plan/propose", {})
        bundle = plan["bundles"][0]
        self.assertIn("RAHMAN SUPPLIES", [action["counterparty"] for action in bundle["actions"]])
        body = {"plan_id": plan["plan_id"], "bundle_id": bundle["bundle_id"], "pin": PIN}
        terms = app.store.risk_acknowledgement_terms(plan, bundle)
        if terms:
            body["risk_acknowledgement"] = {"acknowledged": True, **terms}
        self.assertEqual(post(app, "/api/plan/approve", body)["status"], "awaiting_second_approval")

    def test_import_rechecks_membership_inside_the_write(self):
        app = blank_app()
        app.store.remove_member("shop", OWNER, ACCOUNTANT["id"])
        parsed = {"transactions": [{"id": "t1", "date": "2026-10-05", "description": "Sale", "type": "income",
                                    "amount": "5", "currency": "BDT"}]}
        with self.assertRaises(ValidationError):
            app.store.import_records("shop", parsed, "x", operator=ACCOUNTANT)
        self.assertEqual(app.store.records("shop")["transactions"], [])

    def test_early_payment_is_never_requested_before_the_invoice_exists(self):
        app = blank_app()
        post(app, "/api/inbox/confirm", {"records": [
            {"record_type": "invoice", "id": "future", "customer": "Future Customer", "currency": "BDT", "amount": "200",
             "issue_date": "2026-10-20", "due_date": "2026-10-30"},
            {"record_type": "transaction", "id": "rent", "date": "2026-10-10", "description": "Rent", "type": "expense",
             "currency": "BDT", "amount": "150"}]})
        plan = post(app, "/api/plan/propose", {})
        dates = [action["to_date"] for bundle in plan["bundles"] for action in bundle["actions"] if action["record_id"] == "future"]
        self.assertTrue(dates)
        self.assertTrue(all(day >= "2026-10-20" for day in dates), dates)


class HostedDemo(unittest.TestCase):
    def setUp(self):
        self.app = Application(os.path.join(tempfile.mkdtemp(), "t.sqlite3"))
        self.owner = {"id": "nadia", "name": "Nadia Rahman", "role": "owner"}

    def wrong_pins(self):
        for _ in range(6):
            with self.assertRaises(ValidationError):
                self.app.store.verify_pin("nadia", "0000")

    def test_public_demo_cannot_be_dismantled_or_locked_by_one_visitor(self):
        self.app.store.public_demo = True
        with self.assertRaisesRegex(ValidationError, "shared by everyone"):
            self.app.store.remove_member("shapla-services", self.owner, "imran")
        self.wrong_pins()
        self.assertEqual(self.app.store.verify_pin("nadia", "2468")["id"], "nadia")

    def test_local_copy_keeps_strict_lockout_and_team_control(self):
        self.wrong_pins()
        with self.assertRaisesRegex(ValidationError, "locked"):
            self.app.store.verify_pin("nadia", "2468")
        self.app.store.remove_member("shapla-services", self.owner, "imran")


class ScamShieldPrecision(unittest.TestCase):
    def verdict(self, text):
        return scam_shield.check(text)["verdict"]

    def test_everyday_advance_and_deposit_messages_are_not_scams(self):
        for text in ("কাজের জন্য অগ্রিম ৫০০০ টাকা পাঠালাম, রসিদ পরে দেব।",
                     "Your salary advance of BDT 5,000 for November is approved and will be paid with payroll.",
                     "Your parcel is out for delivery. Delivery charge 60 tk, pay the rider before you open the box.",
                     "Printing job confirmed. Please pay 30% deposit to start, balance on delivery.",
                     "Your loan EMI Tk 5,000 is due on 30 Nov. Late fee Tk 200 applies after that. Please pay on time."):
            with self.subTest(text=text):
                self.assertEqual(self.verdict(text), "no_red_flags")

    def test_no_fee_and_never_share_lines_do_not_hide_a_scam(self):
        for text in ("Your parcel is held at customs. To receive it pay 1500 tk clearance fee today. No charge for home delivery.",
                     "Congratulations, you got the data entry job. Salary 25000. No fee for training. "
                     "Pay 2000 tk registration fee to confirm your seat. Never share your PIN with anyone."):
            with self.subTest(text=text):
                self.assertEqual(self.verdict(text), "likely_scam")


class MoneyAndForecast(unittest.TestCase):
    def test_huge_exponent_is_a_validation_error_not_a_crash(self):
        with self.assertRaises(ValidationError):
            parse_amount("1e9999999999")

    def test_fifteen_digit_minor_units_reimport(self):
        self.assertEqual(minor_value({"amount_minor": "1000000000000"}, "amount"), 10**12)

    def test_week_one_counts_an_opening_balance_below_reserve(self):
        app = blank_app(cash=500, reserve=1000)
        post(app, "/api/inbox/confirm", {"records": [{"record_type": "transaction", "id": "sale", "date": "2026-10-01",
                                                      "description": "Opening-day sale", "type": "income", "currency": "BDT", "amount": "20"}]})
        totals = post(app, "/api/treasury/twcf", {})["scenarios"]["scheduled"]["totals"]
        self.assertEqual(totals["first_breach_date"], "2026-10-01")
        self.assertEqual(totals["first_week_below_reserve"], 1)


class AssistantCoverage(unittest.TestCase):
    def test_everyday_bangla_and_banglish_questions_are_understood(self):
        app = Application(os.path.join(tempfile.mkdtemp(), "t.sqlite3"))
        owner = app.scoped({"id": "nadia", "name": "Nadia Rahman", "role": "owner"}, "shapla-services")
        for question in ("সবচেয়ে কম নগদ কত?", "ক্যাশ কবে সবচেয়ে কম হবে?", "কোন বিল কবে দিতে হবে?", "বকেয়া টাকা কার কাছে?",
                         "cash kobe kom hobe?", "Which customers have unpaid invoices?", "What bills do I have to pay this week?"):
            with self.subTest(question=question):
                reply = app.post("/api/chat", {"business_id": "shapla-services", "message": question}, owner, None)
                self.assertTrue(reply["understood"], reply["text"])


if __name__ == "__main__":
    unittest.main()
