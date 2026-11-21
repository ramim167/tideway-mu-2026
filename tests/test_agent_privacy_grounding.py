import unittest

from tideway.agent import Agent, Pseudonyms, grounding_check
from tideway.service import Tideway


BUSINESS = "shapla-services"


class AgentPrivacyRegressionTests(unittest.TestCase):
    def setUp(self):
        self.app = Tideway(":memory:")
        self.addCleanup(self.app.store.close)

    def test_privacy_preview_scrubs_exact_case_variants_but_not_name_substrings(self):
        aliases = Pseudonyms(self.app.store.snapshot(BUSINESS)["records"])
        expected = aliases.forward["Nila Traders"]
        agent = Agent(self.app)

        for message in ("How is Nila Traders doing?", "How is nila traders doing?",
                        "How is NILA TRADERS doing?"):
            with self.subTest(message=message):
                content = agent.privacy_preview(BUSINESS, None, message)["initial_payload"]["input"][-1]["content"]
                self.assertEqual(content, f"How is {expected} doing?")

        content = agent.privacy_preview(BUSINESS, None, "Nila TradersExtra is unrelated.")["initial_payload"]["input"][-1]["content"]
        self.assertIn("Nila TradersExtra", content)
        self.assertNotIn(expected, content)

    def test_scrubbing_keeps_aliases_and_existing_account_contact_protection(self):
        aliases = Pseudonyms(self.app.store.snapshot(BUSINESS)["records"])
        expected = aliases.forward["Nila Traders"]
        existing_alias = next(alias for alias in aliases.backward if alias != expected)
        value = aliases.scrub(f"NILA TRADERS {existing_alias} AC-2201-4471 owner@example.com +8801712345678")

        self.assertEqual(value.count(expected), 1)
        self.assertEqual(value.count(existing_alias), 1)
        self.assertNotIn("AC-2201-4471", value)
        self.assertNotIn("owner@example.com", value)
        self.assertNotIn("+8801712345678", value)
        self.assertEqual(aliases.restore(aliases.scrub("Nila Traders")), "Nila Traders")


class GroundingCheckRegressionTests(unittest.TestCase):
    def test_small_unsupported_money_is_not_exempt(self):
        self.assertEqual(grounding_check("You need 30 dollars.", {}), ["30"])

    def test_written_amounts_are_withheld(self):
        for statement in ("You have one million dollars.", "আপনার এক লক্ষ টাকা আছে।"):
            self.assertTrue(grounding_check(statement, {}))

    def test_unsupported_day_count_and_date_are_withheld(self):
        self.assertEqual(grounding_check("The delay is 30 days; the target date is 2026-10-31.", {}), ["30", "2026", "10", "31"])

    def test_minor_unit_conversion_remains_supported(self):
        self.assertEqual(grounding_check("Minimum cash: -BDT 42,000.", [{"minimum_cash_minor": -4_200_000, "currency": "BDT"}]), [])

    def test_wrong_field_sign_precision_currency_scenario_or_day_is_unverified(self):
        outputs = [{"likely": {"currency": "BDT", "minimum_cash_minor": -420001,
                               "minimum_cash_date": "2026-10-30"}}]
        fact = "likely · Minimum cash (2026-10-30): -BDT 4,200.01"
        self.assertEqual(grounding_check(fact, outputs, "BDT"), [])
        for old, new in [("-BDT","BDT"), ("Minimum","Opening"), ("BDT","USD"),
                         ("4,200.01","4,200"), ("30)","31)"), ("likely","stress")]:
            with self.subTest(change=(old,new)):
                self.assertTrue(grounding_check(fact.replace(old,new), outputs, "BDT"))

    def test_spelled_amounts_and_payroll_verdicts_require_evidence(self):
        app = Tideway(":memory:")
        self.addCleanup(app.store.close)
        for claim in ("Payroll is covered for ten days.", "You owe thirteen dollars.",
                      "The business is solvent.", "বেতন দিতে তেরো দিন বাকি।"):
            with self.subTest(claim=claim):
                def transport(payload, key):
                    return {"output": [{"type": "message", "content": [{"type": "output_text", "text": claim}]}]}
                result = Agent(app, "test", transport=transport).chat(
                    BUSINESS, None, "How long can I pay salaries?", consent=True, ui_lang="en")
                self.assertTrue(result.get("grounding_rejected"), result)
                self.assertNotIn(claim, result["text"])

    def test_unresolved_cloud_claim_is_withheld_even_without_recognized_question(self):
        app = Tideway(":memory:")
        self.addCleanup(app.store.close)
        def transport(payload, key):
            return {"output": [{"type": "message", "content": [{"type": "output_text", "text": "BDT 54321"}]}]}
        result = Agent(app, "test", transport=transport).chat(BUSINESS, None, "unrecognized query", consent=True)
        self.assertTrue(result["grounding_rejected"])
        self.assertNotIn("54321", str(result["text"]))


if __name__ == "__main__":
    unittest.main()
