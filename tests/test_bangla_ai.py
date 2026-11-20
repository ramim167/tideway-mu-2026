"""Bangla in the assistant: Banglish gets Bangla in Bangla mode, and AI answers are cleaned and number-checked."""
import unittest

from tideway.agent import Agent, chat_to_responses, clean_answer, grounding_check, responses_to_chat
from tideway.service import Tideway

SHAPLA = "shapla-services"


class BanglaMode(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.agent = Agent(Tideway(":memory:"))

    def ask(self, message, ui_lang):
        return self.agent.chat(SHAPLA, None, message, [], False, "agent:local", "owner", "Nadia Rahman", ui_lang)["text"]

    def test_banglish_gets_bangla_when_the_app_is_in_bangla(self):
        self.assertTrue(self.ask("kemon acho", "bn").startswith("Nadia, আসসালামু আলাইকুম!"))
        self.assertIn("বেতন", self.ask("beton dite parbo?", "bn"))

    def test_english_mode_is_unchanged(self):
        self.assertTrue(self.ask("hi", "en").startswith("Hi Nadia!"))
        self.assertTrue(self.ask("hi", None).startswith("Hi Nadia!"))


class AiAnswerSafety(unittest.TestCase):
    def test_bangla_digits_cannot_slip_past_the_number_check(self):
        outputs = [{"minimum_cash_minor": -1000000, "payroll_outflow_minor": 8000000}]
        self.assertEqual(grounding_check("বেতন BDT ৮০,০০০, সর্বনিম্ন -BDT ১০,০০০।", outputs), [])
        self.assertEqual(grounding_check("ঘাটতি BDT ৯৯,৯৯৯।", outputs), ["99,999"])

    def test_answers_are_plain_text_and_single_script_in_bangla(self):
        self.assertEqual(clean_answer("**না**, এই মাসে `payroll` ঝুঁকি।"), "না, এই মাসে payroll ঝুঁকি।")
        self.assertEqual(clean_answer("নहीं, বেতন 회복 ঝুঁকি।", "bn"), "ন, বেতন ঝুঁকি।")
        self.assertEqual(clean_answer("Hello 你好", "en"), "Hello 你好")

    def test_bangla_instruction_reaches_the_model(self):
        sent = []
        replies = iter([{"choices": [{"message": {"content": "**বেতন ঝুঁকিতে আছে।**"}}]}])

        def transport(payload, key):
            sent.append(responses_to_chat(payload))
            return chat_to_responses(next(replies))

        bot = Agent(Tideway(":memory:"), "k", "m:free", transport=transport)
        reply = bot.chat(SHAPLA, None, "beton dite parbo?", [], True, "agent:llm", "owner", "Nadia", "bn")
        self.assertIn("Always reply in standard Bangla", sent[0]["messages"][0]["content"])
        self.assertEqual(reply["text"], "বেতন ঝুঁকিতে আছে।")


if __name__ == "__main__":
    unittest.main()
