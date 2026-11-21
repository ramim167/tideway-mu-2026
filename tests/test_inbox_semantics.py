"""Money, document references and relative dates must retain their financial meaning."""
import unittest

from tideway.inbox_rules import extract
from tideway.service import Tideway
from tideway.tidelm import TideLM, TideLMUnavailable


BUSINESS = {"name": "Shop", "currency": "BDT"}
PARTIES = ["Bay Logistics", "Nila Traders", "Rahman Supplies"]


class InboxSemantics(unittest.TestCase):
    def read(self, text, today="2026-10-02"):
        return extract(text, BUSINESS, today, PARTIES)["records"]

    def test_south_asian_grouping_retains_the_full_amount(self):
        for value, expected in (("1,00,000.00", 100000), ("12,34,567.89", 1234567.89),
                                ("১,০০,০০০.৫০", 100000.5), ("1,000,000.50", 1000000.5),
                                ("1.234,56", 1234.56)):
            with self.subTest(value=value):
                row = self.read(f"You received Tk {value} from Bay Logistics on 2026-10-02.")[0]
                self.assertEqual(row["amount"], expected)

    def test_audit_payment_and_supplier_document_examples(self):
        for token, expected in (("1,00,000", 100000), ("1,23,456.78", 123456.78)):
            row, = self.read(f"Received Tk {token} this Thursday", "2026-10-01")
            self.assertEqual((row["amount"], row["date"]), (expected, "2026-10-01"))
        bill, = self.read("Factura de proveedor EUR 200 due 29 Feb 2028", "2026-10-01")
        self.assertEqual((bill["record_type"], bill["direction"], bill["due_date"]),
                         ("bill", "out", "2028-02-29"))

    def test_english_payables_and_explicit_paid_to(self):
        bill, = self.read("Supplier invoice from Rahman Supplies for Tk 1,00,000 due 2026-11-30")
        self.assertEqual((bill["record_type"], bill["direction"], bill["amount"]), ("bill", "out", 100000))
        paid, = self.read("I paid Tk 500 to Mina today")
        self.assertEqual((paid["record_type"], paid["direction"], paid["counterparty"]), ("transaction", "out", "Mina"))
        self.assertEqual(self.read("I did not pay Tk 500 to Mina today"), [])

    def test_amount_scale_and_unsupported_scale(self):
        for amount, expected in (("Tk 1 lakh", 100000), ("Tk 2.5 crore", 25000000), ("১ লাখ টাকা", 100000)):
            self.assertEqual(self.read(f"Received {amount} from Bay Logistics today")[0]["amount"], expected)
        unknown, = self.read("Received Tk 2 trillion from Bay Logistics today")
        self.assertIsNone(unknown["amount"])
        self.assertIn("unrecognized amount scale", " ".join(unknown["_checks"]))

    def test_yearless_invalid_date_keeps_other_drafts(self):
        receipt, bill = self.read("Received Tk 100 today\nBill for Tk 300 due 29 Feb")
        self.assertEqual(receipt["date"], "2026-10-02")
        self.assertIsNone(bill["due_date"])
        self.assertIn("29 Feb needs a valid day and year", bill["_checks"])

    def test_malformed_grouping_never_becomes_a_smaller_payment(self):
        for value in ("1,000,00", "12,34,56", "1,00,0000"):
            with self.subTest(value=value):
                self.assertEqual(self.read(f"You received Tk {value} from Bay Logistics on 2026-10-02."), [])

    def test_payment_references_do_not_create_new_invoices_or_bills(self):
        for text, direction in (("You received Tk 2,000.00 from Bay Logistics for invoice INV-123 on 2026-10-02.", "in"),
                                ("Tk 2,000.00 debited to Rahman Supplies for bill BL-123 on 2026-10-02.", "out")):
            with self.subTest(text=text):
                row = self.read(text)[0]
                self.assertEqual(row["record_type"], "transaction")
                self.assertEqual(row["direction"], direction)
                self.assertEqual(row["amount"], 2000)

    def test_document_delivery_is_not_a_money_transfer(self):
        for text, kind in (("Invoice INV-123 sent to Nila Traders for Tk 2,000. Issued 2026-10-02, due 2026-10-31.", "invoice"),
                           ("Rahman Supplies: bill Tk 2,000 due 2026-10-31.", "bill")):
            with self.subTest(text=text):
                self.assertEqual(self.read(text)[0]["record_type"], kind)

    def test_unknown_direction_does_not_default_to_a_paid_expense(self):
        self.assertEqual(self.read("Amount Tk 2,000 from Bay Logistics on 2026-10-02."), [])

    def test_cash_in_and_cash_out_are_explicit_money_movements(self):
        for text, direction in (("Cash In Tk 2,000 from Bay Logistics on 2026-10-02.", "in"),
                                ("Cash Out Tk 2,000 to Rahman Supplies on 2026-10-02.", "out")):
            with self.subTest(text=text):
                self.assertEqual(self.read(text)[0]["direction"], direction)

    def test_today_and_next_weekday_are_distinct(self):
        for phrase, expected in (("this Friday", "2026-10-02"), ("on Friday", "2026-10-02"),
                                 ("Friday", "2026-10-02"), ("next Friday", "2026-10-09"),
                                 ("coming Friday", "2026-10-09")):
            with self.subTest(phrase=phrase):
                row = self.read(f"Nila Traders will pay Tk 2,000 {phrase}")[0]
                self.assertEqual(row["due_date"], expected)

    def test_next_weekday_before_it_arrives_is_unchanged(self):
        row = self.read("Nila Traders will pay Tk 2,000 next Friday", "2026-10-01")[0]
        self.assertEqual(row["due_date"], "2026-10-02")

    def test_fallback_drafts_a_received_invoice_payment_as_income(self):
        def unavailable(_system, _user):
            raise TideLMUnavailable("No model in this regression test")
        app = Tideway(":memory:")
        try:
            before = app.store.snapshot("shapla-services")["snapshot_hash"]
            result = TideLM(generator=unavailable).extract(app, "shapla-services",
                "You received Tk 1,00,000 from Bay Logistics for invoice INV-123 on 2026-10-02.")
            row = result["drafts"][0]
            self.assertTrue(row["ready"])
            self.assertEqual((row["record"]["record_type"], row["record"]["type"], row["record"]["amount"]),
                             ("transaction", "income", 100000))
            self.assertEqual(app.store.snapshot("shapla-services")["snapshot_hash"], before)
        finally:
            app.store.close()
