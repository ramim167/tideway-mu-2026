"""Financial input regressions: ambiguous text must not invent settled money or delays."""
import unittest

from tideway import conversation, scam_shield
from tideway.agent import Agent
from tideway.service import Tideway
from tideway.tidelm import TideLM, TideLMUnavailable


BUSINESS = "shapla-services"
CUSTOMERS = ["Bay Logistics", "Nila Traders"]


def unavailable_model(_system, _user):
    raise TideLMUnavailable("No model in this regression test")


class InboxFinancialInputs(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.app = Tideway(":memory:")
        cls.extractor = TideLM(generator=unavailable_model)

    @classmethod
    def tearDownClass(cls):
        cls.app.store.close()

    def extract(self, text):
        before = self.app.store.snapshot(BUSINESS)["snapshot_hash"]
        result = self.extractor.extract(self.app, BUSINESS, text)
        self.assertEqual(self.app.store.snapshot(BUSINESS)["snapshot_hash"], before)
        return result["drafts"]

    def test_payment_amount_is_independent_of_balance_and_fee_order(self):
        payment = "You have received Tk 2,000.00 from Bay Logistics on 2026-10-02."
        for text in (f"Balance Tk 12,000.00. {payment}",
                     f"Fee Tk 0.00. {payment} Balance Tk 12,000.00.",
                     "You received Tk 2,000.00 Balance Tk 12,000.00 Fee Tk 10.00 "
                     "from Bay Logistics on 2026-10-02.",
                     f"{payment} Available balance is Tk 12,000.00. Fee Tk 10.00."):
            with self.subTest(text=text):
                drafts = self.extract(text)
                self.assertEqual(len(drafts), 1)
                self.assertTrue(drafts[0]["ready"])
                self.assertEqual(drafts[0]["record"]["amount"], 2000)
                self.assertEqual(drafts[0]["record"]["type"], "income")

    def test_balance_fee_and_ambiguous_amounts_are_not_transactions(self):
        for text in ("Available balance Tk 12,000.00 on 2026-10-02.",
                     "Fee Tk 10.00. Balance Tk 12,000.00.",
                     "Bay Logistics received Tk 2,000.00 or Tk 3,000.00 on 2026-10-02."):
            with self.subTest(text=text):
                self.assertEqual(self.extract(text), [])

    def test_unsuccessful_transfers_do_not_create_settled_income_or_expenses(self):
        for text in ("Amount Tk 1,000.00 was not received from Bay Logistics on 2026-10-02.",
                     "Tk 1,000.00 has not yet been credited from Bay Logistics on 2026-10-02.",
                     "We haven't received Tk 1,000.00 from Bay Logistics on 2026-10-02.",
                     "Transfer of Tk 1,000.00 to Rahman Supplies failed on 2026-10-02.",
                     "Payment Tk 1,000.00 to Rahman Supplies is pending on 2026-10-02."):
            with self.subTest(text=text):
                self.assertEqual(self.extract(text), [])

    def test_unpaid_invoices_are_still_receivables(self):
        draft = self.extract("Invoice INV-444 to Nila Traders for Tk 2,000, issued 2026-10-02, "
                             "due 2026-10-31. This invoice is unpaid.")[0]
        self.assertTrue(draft["ready"])
        self.assertEqual(draft["record"]["record_type"], "invoice")

    def test_unrelated_pending_reminder_does_not_erase_a_received_payment(self):
        drafts = self.extract("Your payment Tk 2,000.00 was received from Bay Logistics on 2026-10-02. "
                              "No pending transactions.")
        self.assertEqual(len(drafts), 1)
        self.assertEqual(drafts[0]["record"]["amount"], 2000)
        self.assertEqual(drafts[0]["record"]["type"], "income")


class BanglaFinancialInputs(unittest.TestCase):
    def test_sender_digits_and_spacing_do_not_change_fraud_verdict(self):
        text = "You have received Tk 5,000.00 from 01712345678. TrxID ABC1234567. Balance Tk 8,000.00."
        baseline = scam_shield.check(text, "01788888888")
        for sender in ("০১৭৮৮৮৮৮৮৮৮", "+৮৮০১৭৮৮৮৮৮৮৮৮", "০১৭৮৮-৮৮৮৮৮৮", "০১৭৮৮\u00a0৮৮৮৮৮৮"):
            with self.subTest(sender=sender):
                result = scam_shield.check(text, sender)
                self.assertTrue(result["sender_is_phone_number"])
                self.assertEqual(result["verdict"], "likely_scam")
                self.assertEqual(result["risk_score"], baseline["risk_score"])
                self.assertEqual(result["sender"], sender)

    def test_customer_delays_work_before_and_after_names(self):
        for text in ("Bay Logistics যদি ১০ দিন দেরি করে এবং Nila Traders যদি ২০ দিন দেরি করে?",
                     "যদি ১০ দিন দেরি করে Bay Logistics এবং ২০ দিন দেরি করে Nila Traders?",
                     "যদি ২০ দিন দেরি করে Nila Traders এবং ১০ দিন দেরি করে Bay Logistics?"):
            with self.subTest(text=text):
                kind, details = conversation.intent(text, CUSTOMERS, "bn")
                self.assertEqual(kind, "whatif")
                self.assertEqual(details["delays"], {"Bay Logistics": 10, "Nila Traders": 20})

    def test_one_explicit_shared_delay_applies_to_both_customers(self):
        kind, details = conversation.intent("Bay Logistics এবং Nila Traders যদি ১০ দিন দেরি করে?", CUSTOMERS, "bn")
        self.assertEqual(kind, "whatif")
        self.assertEqual(details["delays"], dict.fromkeys(CUSTOMERS, 10))

    def test_ambiguous_delay_assignments_request_clarification_without_tools(self):
        app = Tideway(":memory:")
        try:
            for text in ("Bay Logistics এবং Nila Traders যদি ১০ ও ২০ দিন দেরি করে?",
                         "Bay Logistics এবং Nila Traders যদি ১০ দিন ও ২০ দিন দেরি করে?",
                         "Bay Logistics যদি ১০ দিন বা ২০ দিন দেরি করে?"):
                with self.subTest(text=text):
                    self.assertEqual(conversation.intent(text, CUSTOMERS, "bn"), ("ambiguous_delay", {}))
                    reply = Agent(app).chat(BUSINESS, None, text, ui_lang="bn")
                    self.assertEqual(reply["trace"], [])
                    self.assertIn("কত দিন", reply["text"])
        finally:
            app.store.close()
