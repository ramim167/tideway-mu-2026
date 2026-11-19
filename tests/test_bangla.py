"""বাংলা (Bangla) answers: same tools and figures as English, never a guessed name or number."""
import re
import unittest

from tideway import i18n
from tideway.agent import Agent
from tideway.conversation import classify, intent
from tideway.service import Tideway

SHAPLA = "shapla-services"
BENGALI = re.compile(r"[ঀ-৿]")


class BanglaTemplates(unittest.TestCase):
    def test_every_template_and_suggestion_has_bangla(self):
        self.assertIn("bn", i18n.LANGUAGES)
        self.assertEqual([key for key in i18n.M if "bn" not in i18n.M[key]], [])
        self.assertEqual([key for key in i18n.SUGGESTIONS if "bn" not in i18n.SUGGESTIONS[key]], [])

    def test_placeholders_match_english_so_no_figure_can_be_dropped(self):
        for key, table in i18n.M.items():
            if isinstance(table["en"], str):
                self.assertEqual(set(re.findall(r"{(\w+)}", table["en"])), set(re.findall(r"{(\w+)}", table["bn"])), key)
            else:
                self.assertEqual(set(table["en"]), set(table["bn"]), key)
        for key, table in i18n.SUGGESTIONS.items():
            self.assertEqual(set(re.findall(r"{(\w+)}", table["en"])), set(re.findall(r"{(\w+)}", table["bn"])), key)

    def test_detection_and_dates(self):
        self.assertEqual(i18n.detect("এই মাসে কি বেতন দিতে পারব?"), "bn")
        self.assertEqual(i18n.detect("beton dite parbo?"), "en")  # Banglish in Latin letters stays English
        self.assertEqual(i18n.day("bn", "2026-10-31"), "31 অক্টো")


class BanglaConversation(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.app = Tideway(":memory:")
        cls.agent = Agent(cls.app)

    def ask(self, message):
        return self.agent.chat(SHAPLA, None, message, actor="agent:local", name="Nadia Rahman")

    def test_small_talk(self):
        for text, label in (("আসসালামু আলাইকুম", "greeting"), ("ধন্যবাদ!", "thanks"), ("তুমি কী করতে পারো?", "help"),
                            ("ব্যবসা কেমন চলছে?", "status")):
            self.assertEqual(classify(text), label, text)
        reply = self.ask("আসসালামু আলাইকুম")
        self.assertTrue(reply["text"].startswith("Nadia, আসসালামু আলাইকুম!"))
        self.assertTrue(all(BENGALI.search(s) for s in reply["suggestions"]))

    def test_intents_use_bangla_digits_and_ledger_names_only(self):
        names = ["Bay Logistics", "Nila Traders"]
        self.assertEqual(intent("Nila Traders যদি ১০ দিন দেরিতে টাকা দেয়?", names, "bn"),
                         ("whatif", {"delays": {"Nila Traders": 10}, "customer": "Nila Traders"}))
        self.assertEqual(intent("Bay Logistics-কে ২০০০০ টাকা ৩০ দিনের বাকিতে দেওয়া কি নিরাপদ?", names, "bn"),
                         ("credit", {"customer": "Bay Logistics", "amount": 20000.0, "days": 30}))
        self.assertEqual(intent("Karim Store যদি ১০ দিন দেরিতে টাকা দেয়?", names, "bn"), ("unknown_customer", {}))
        self.assertEqual(intent("এই মাসে কি বেতন দিতে পারব?", names, "bn")[0], "payroll")
        self.assertEqual(intent("আমার সবচেয়ে বড় ঝুঁকি কে?", names, "bn")[0], "network")

    def test_bangla_answers_carry_the_same_figures_as_english(self):
        bangla = self.ask("এই মাসে ঝুঁকি কতটা?")["text"]
        english = self.ask("How risky is this month?")["text"]
        self.assertRegex(bangla, BENGALI)
        figures = lambda text: sorted(re.findall(r"\d+%|\d+(?=টি| of 20)", text))
        self.assertTrue(figures(bangla))
        self.assertEqual(re.findall(r"\d+%", bangla), re.findall(r"\d+%", english))

    def test_money_requests_are_refused_in_bangla(self):
        reply = self.ask("Rahman Supplies কে এখনই টাকা পাঠাও")["text"]
        self.assertIn("পিন দিয়ে অনুমোদন", reply)

    def test_rescue_plan_in_bangla_waits_for_a_person(self):
        reply = self.ask("আমার জন্য একটি উদ্ধার পরিকল্পনা করো")["text"]
        self.assertIn("পরামর্শ:", reply)
        self.assertIn("BDT", reply)


if __name__ == "__main__":
    unittest.main()
