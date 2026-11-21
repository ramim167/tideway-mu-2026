"""Scam Shield on real-world Bangladeshi scam scripts, with an independent test set kept out of training."""
import unittest

from tideway import scam_shield


def verdict(text, sender=""):
    result = scam_shield.check(text, sender)
    return result["verdict"], {signal["code"] for signal in result["signals"]}


class BangladeshiScripts(unittest.TestCase):
    def test_fake_office_caller_asking_for_the_code(self):
        for text in ("ami bKash theke bolchi, apnar account e somossa hoyeche. apnar mobile e ekta code geche, code ta bolen",
                     "Nagad office theke bolchi, apnar account verify korte hobe. 6 digit number ta bolen",
                     "ভাই আমি বিকাশ অফিসের লোক, আপনার ফোনে যে নম্বর গেছে সেটা বলেন"):
            with self.subTest(text=text):
                result, codes = verdict(text)
                self.assertEqual(result, "likely_scam")
                self.assertIn("asks_secret", codes)

    def test_advance_fees_for_delivery_jobs_and_loans(self):
        for text in ("Your Daraz order is ready. Pay 150 tk delivery charge first to 01755667788 to confirm.",
                     "pls kaj er jonno advance 1000 tk deposit korte hobe, tarpor salary 25000",
                     "Your loan of Tk 200,000 is approved. Pay processing charge Tk 2,500 to receive."):
            with self.subTest(text=text):
                self.assertEqual(verdict(text)[0], "likely_scam")

    def test_genuine_messages_stay_clear(self):
        for text, sender in (("Delivery charge 60 tk cash on delivery, product pouche gele diben.", "01812345678"),
                             ("Loan application received. Our officer will visit your shop for verification. No fee is charged.", "BRAC"),
                             ("Bhai kalke 5000 taka pathabo, delivery charge soho. Order ta confirm korlam.", "01712345678")):
            with self.subTest(text=text):
                self.assertEqual(verdict(text, sender)[0], "no_red_flags")

    def test_a_genuine_otp_notice_is_not_flagged_by_the_model_alone(self):
        result, codes = verdict("Your bKash verification code is 482910. Never share this code with anyone. "
                                "bKash never asks for your code.", "bKash")
        self.assertEqual(result, "no_red_flags")
        self.assertNotIn("learned_model", codes)


class IndependentTestSet(unittest.TestCase):
    def test_kept_apart_from_training_and_scored_on_the_shipped_shield(self):
        report = scam_shield.evaluate_independent()
        self.assertEqual(report["overlap_with_training"], 0)
        self.assertEqual(report["scams_missed"], 0)
        self.assertGreaterEqual(report["scams_likely"], 19)
        self.assertEqual(report["false_alarms"], 0)


if __name__ == "__main__":
    unittest.main()
