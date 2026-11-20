"""Bangla in the assistant: Banglish gets Bangla in Bangla mode, and AI answers are cleaned and number-checked."""
import unittest

from tideway.agent import Agent, Pseudonyms, answer_issues, chat_to_responses, clean_answer, grounding_check, responses_to_chat
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

    def test_who_to_chase_first_in_bangla_and_banglish(self):
        for question in ("কাকে আগে টাকা চাইব?", "kake age taka chaibo?", "কার কাছ থেকে আগে টাকা নেব?"):
            self.assertIn("Bay Logistics", self.ask(question, "bn"), question)

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


GARBLED = "নহীঁ, বেতন (পে,রোল) আপসেট। payroll_at_risk: true। ক্যাশ-ফ্লো কopilot ار"


def scripted_bot(texts, sent=None):
    replies = iter(texts)

    def transport(payload, key):
        if sent is not None:
            sent.append(responses_to_chat(payload))
        return chat_to_responses({"choices": [{"message": {"content": next(replies)}}]})
    return Agent(Tideway(":memory:"), "k", "m:free", transport=transport)


class GarbledAnswers(unittest.TestCase):
    def test_garbled_replies_are_detected_and_clean_ones_pass(self):
        self.assertTrue({"code_words", "mixed_script_word", "foreign_script"} <= set(answer_issues(GARBLED, "bn")))
        self.assertEqual(answer_issues("এই মাসে বেতন দিতে ঝুঁকি আছে। হাতে BDT 120,000, খরচ BDT 177,000।", "bn"), [])
        self.assertEqual(answer_issues("Shapla Services-এর নগদ টাকা কম।", "bn"), [])
        self.assertEqual(answer_issues("Payroll is at risk.", "en"), [])
        self.assertEqual(answer_issues("payroll_at_risk: true", "en"), ["code_words"])

    def test_a_garbled_reply_is_rewritten_once(self):
        sent = []
        bot = scripted_bot([GARBLED, "এই মাসে বেতন দিতে ঝুঁকি আছে।"], sent)
        reply = bot.chat(SHAPLA, None, "beton dite parbo?", [], True, "agent:llm", "owner", "Nadia", "bn")
        self.assertEqual((reply["mode"], reply["text"]), ("llm", "এই মাসে বেতন দিতে ঝুঁকি আছে।"))
        self.assertIn("Rewrite the same answer in clean", sent[1]["messages"][-1]["content"])

    def test_still_garbled_falls_back_to_the_checked_local_answer(self):
        reply = scripted_bot([GARBLED, GARBLED]).chat(SHAPLA, None, "এই মাসে কি বেতন দিতে পারব?", [], True, "agent:llm",
                                                     "owner", "Nadia", "bn")
        self.assertTrue(reply.get("ai_fallback"))
        self.assertIn("বেতন ঝুঁকিতে আছে", reply["text"])
        self.assertIn("যাচাই করা উত্তর", reply["text"])
        self.assertNotIn("payroll_at_risk", reply["text"])

    def test_an_english_sentence_in_a_bangla_answer_is_caught(self):
        tail = "বেতন ঝুঁকিতে আছে। All three scenarios show payroll at risk."
        self.assertEqual(answer_issues(tail, "bn"), ["english_sentence"])
        self.assertEqual(answer_issues("Customer 1 এবং Shapla Services-এর BDT 60,000 বাকি।", "bn"), [])

    def test_translated_pseudonyms_are_restored_to_real_names(self):
        aliases = Pseudonyms({"invoices": [{"customer": "Nila Traders"}, {"customer": "Padma Foods"}],
                              "bills": [{"payee": "Meghna Supplies"}]})
        self.assertEqual(aliases.restore("প্রথমে গ্রাহক ১ কে টাকা চান, তারপর ক্রেতা 2-এর কাছে।"),
                         "প্রথমে Nila Traders কে টাকা চান, তারপর Padma Foods-এর কাছে।")
        self.assertEqual(aliases.restore("সরবরাহকারী ১ এবং customer 2"), "Meghna Supplies এবং Padma Foods")
        self.assertEqual(aliases.restore("গ্রাহক ৯ নেই"), "গ্রাহক ৯ নেই")  # unknown labels stay as written

    def test_a_space_follows_each_full_stop(self):
        self.assertEqual(clean_answer("ঝুঁকি আছে।পরিকল্পনা দরকার।", "bn"), "ঝুঁকি আছে। পরিকল্পনা দরকার।")


if __name__ == "__main__":
    unittest.main()
