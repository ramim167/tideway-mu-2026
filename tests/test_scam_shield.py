"""Scam Shield: MFS fraud checks for bKash, Nagad and Rocket messages (rules + learned model)."""
import http.client
import json
import threading
import unittest
from http.server import ThreadingHTTPServer

from tideway import scam_shield
from tideway.security import RateLimiter
from tideway.server import Application, make_handler

GENUINE = ("You have received Tk 5,000.00 from 01712345678. Ref order 77. Fee Tk 0.00. Balance Tk 5,410.00. "
           "TrxID 8N7A6B5C4D at 20/11/2026 10:15")


def codes(result):
    return {signal["code"] for signal in result["signals"]}


class ScamShieldRules(unittest.TestCase):
    def test_pin_or_otp_request_is_always_likely_scam(self):
        for text in ("bKash office theke bolchi, apnar PIN ta bolen please",
                     "আপনার একাউন্ট চালু রাখতে ওটিপি কোডটি আমাদের পাঠান",
                     "Reply with the 6 digit code we sent to keep your Nagad wallet active"):
            result = scam_shield.check(text)
            self.assertEqual(result["verdict"], "likely_scam", text)
            self.assertIn("asks_secret", codes(result))

    def test_safety_advice_is_not_mistaken_for_a_request(self):
        result = scam_shield.check("bKash never asks for your PIN or OTP. Do not share them with anyone.")
        self.assertNotIn("asks_secret", codes(result))
        self.assertEqual(result["verdict"], "no_red_flags")
        # ...but advice followed by a request is still a request.
        trap = scam_shield.check("bKash never asks for your PIN, but please tell us the OTP now to stop the block.")
        self.assertIn("asks_secret", codes(trap))

    def test_request_object_punctuation_retains_negation_scope(self):
        for delimiter in ("", ":", ",", "："):
            self.assertIn("asks_secret", codes(scam_shield.check(f"Please confirm{delimiter} your OTP.")))
            self.assertNotIn("asks_secret", codes(scam_shield.check(f"Never share{delimiter} your OTP.")))
        text = "Never share your PIN. Please confirm: your OTP."
        self.assertIn("asks_secret", codes(scam_shield.check(text)))

    def test_disclaimer_only_applies_within_its_clause(self):
        for text in ("Never share your PIN. Send us your OTP.",
                     "Never give away your PIN; reply with the verification code.",
                     "Never share your PIN and please enter your OTP.",
                     "পিন কাউকে দেবেন না। এখন ওটিপি বলুন।",
                     "PIN kauke deben na\nOTP ta bolen"):
            with self.subTest(text=text):
                self.assertIn("asks_secret", codes(scam_shield.check(text)))
        for text in ("Never share your PIN, but do not send your OTP either.",
                     "Don't send the code to anyone. Never give anyone your PIN.",
                     "কাউকে আপনার পিন বলবেন না। ওটিপি শেয়ার করবেন না।"):
            with self.subTest(text=text):
                self.assertNotIn("asks_secret", codes(scam_shield.check(text)))

    def test_wrong_send_refund_trick_in_three_scripts(self):
        for text in ("Sorry I sent Tk 3,000 to you by mistake, please send it back",
                     "Bhai bhul kore 3000 taka pathiye felechi, ferot pathan please",
                     "ভাই ভুল করে আপনার নাম্বারে ৩০০০ টাকা চলে গেছে, প্লিজ ফেরত দিন"):
            result = scam_shield.check(text)
            self.assertIn("wrong_send_refund", codes(result), text)
            self.assertNotEqual(result["verdict"], "no_red_flags", text)
            self.assertTrue(any("balance" in action["en"].lower() for action in result["actions"]))

    def test_fake_cash_in_sms_is_caught_by_the_sender_not_the_text(self):
        official = scam_shield.check(GENUINE, sender="bKash")
        self.assertEqual(official["verdict"], "no_red_flags")
        self.assertEqual(official["claims"]["transaction_id"], "8N7A6B5C4D")
        self.assertEqual(official["claims"]["amount_bdt"], 5000.0)
        spoofed = scam_shield.check(GENUINE, sender="01712345678")
        self.assertEqual(spoofed["verdict"], "likely_scam")
        self.assertIn("notice_from_phone_number", codes(spoofed))
        self.assertTrue(spoofed["sender_is_phone_number"])
        # Preserve the printed sender while assessing equivalent local/international numerals identically.
        for sender in ("০১৭১২৩৪৫৬৭৮", "+৮৮০১৭১২৩৪৫৬৭৮", "+৮৮০ ১৭১২-৩৪৫৬৭৮", "+8801712345678"):
            with self.subTest(sender=sender):
                result = scam_shield.check(GENUINE, sender=sender)
                self.assertEqual(result["sender"], sender)
                self.assertTrue(result["sender_is_phone_number"])
                self.assertEqual(result["verdict"], spoofed["verdict"])
                self.assertEqual(codes(result), codes(spoofed))

    def test_prize_fee_link_and_changed_number(self):
        prize = scam_shield.check("Congratulations! You won Tk 50,000 in a lucky draw. Send Tk 500 registration fee to 01811223344.")
        self.assertTrue({"fee_to_receive", "pay_personal_number"} <= codes(prize))
        link = scam_shield.check("Your Nagad wallet is suspended. Verify at http://nagad-verify.xyz within 30 minutes.")
        self.assertTrue({"link", "account_threat"} <= codes(link))
        self.assertEqual(link["provider"], "Nagad")
        self.assertTrue(any("16167" in action["en"] for action in link["actions"]))

    def test_ordinary_business_messages_have_no_red_flags(self):
        for text in ("Invoice INV-2291 to Nila Traders, Tk 20,000, due 5 December.",
                     "Loan instalment of Tk 6,500 is due on 10 December. Pay at the branch or in the official bank app.",
                     "আপনার অর্ডারের টাকা পেয়েছি, ধন্যবাদ। মাল আজ বিকেলে পাঠিয়ে দিচ্ছি।",
                     "Bhai kalke 10,000 taka bKash kore dibo, invoice ta pathiye din."):
            self.assertEqual(scam_shield.check(text)["verdict"], "no_red_flags", text)

    def test_every_reason_and_action_is_bilingual_and_advice_only(self):
        result = scam_shield.check("আপনার বিকাশ একাউন্ট বন্ধ হয়ে যাবে। এখনই পিন বলুন।")
        self.assertTrue(result["advisory_only"])
        for item in result["signals"] + result["actions"]:
            self.assertTrue(item["en"] and item["bn"])
            self.assertRegex(item["bn"], "[ঀ-৿]")
        self.assertLessEqual(result["risk_score"], 100)

    def test_input_limits(self):
        for bad in ("", "   ", None, 5):
            with self.assertRaises(ValueError):
                scam_shield.check(bad)
        with self.assertRaises(ValueError):
            scam_shield.check("x" * (scam_shield.MAX_TEXT + 1))


class ScamShieldModel(unittest.TestCase):
    def test_corpus_is_balanced_labelled_and_synthetic(self):
        rows = scam_shield.load_corpus()
        labels = [label for _, label in rows]
        self.assertEqual(set(labels), {"scam", "legit"})
        self.assertGreaterEqual(min(labels.count("scam"), labels.count("legit")), 40)
        self.assertTrue(any("ঀ" <= ch <= "৿" for text, _ in rows for ch in text))

    def test_held_out_evaluation_is_reproducible(self):
        first, second = scam_shield.evaluate(), scam_shield.evaluate()
        self.assertEqual(first, second)
        self.assertTrue(first["synthetic_data"])
        self.assertGreater(first["held_out_messages"], 15)
        self.assertGreaterEqual(first["learned_model_only"]["recall_scam"], 0.7)
        self.assertGreaterEqual(first["rules_plus_model"]["recall_scam"], first["learned_model_only"]["recall_scam"])

    def test_probability_is_calibrated_not_saturated_for_neutral_text(self):
        probability, _ = scam_shield.model().probability("Please confirm the delivery time for tomorrow.")
        self.assertGreater(probability, 0.01)
        self.assertLess(probability, 0.9)


class ScamShieldHTTP(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.app = Application(":memory:")
        cls.app.login_limiter = RateLimiter(capacity=1000, refill_per_second=100)
        cls.app.post_limiter = RateLimiter(capacity=1000, refill_per_second=100)

        class Quiet(make_handler(cls.app)):
            def log_message(self, *_args):
                pass
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), Quiet)
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()
        cls.owner = cls.login("nadia", "2468")
        cls.viewer = cls.login("guest", "0000")

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.app.store.close()

    @classmethod
    def call(cls, path, body, cookie=None, csrf=True):
        conn = http.client.HTTPConnection("127.0.0.1", cls.server.server_port, timeout=30)
        headers = {"Content-Type": "application/json"}
        if csrf:
            headers["X-Tideway-Token"] = cls.app.csrf
        if cookie:
            headers["Cookie"] = cookie
        conn.request("POST", path, json.dumps(body), headers)
        response = conn.getresponse()
        data = json.loads(response.read())
        set_cookie = response.getheader("Set-Cookie")
        conn.close()
        return response.status, data, set_cookie.split(";", 1)[0] if set_cookie else None

    @classmethod
    def login(cls, identifier, pin):
        status, data, cookie = cls.call("/api/session/login", {"operator_id": identifier, "pin": pin})
        assert status == 200, data
        return cookie

    def test_any_member_can_check_and_nothing_changes(self):
        before = self.app.store.snapshot("shapla-services")["snapshot_hash"]
        status, data, _ = self.call("/api/shield/check", {"text": GENUINE, "sender": "01712345678"}, self.viewer)
        self.assertEqual(status, 200, data)
        self.assertEqual(data["verdict"], "likely_scam")
        self.assertEqual(self.app.store.snapshot("shapla-services")["snapshot_hash"], before)

    def test_requires_session_csrf_and_valid_fields(self):
        self.assertEqual(self.call("/api/shield/check", {"text": "hi"})[0], 401)
        self.assertEqual(self.call("/api/shield/check", {"text": "hi"}, self.owner, csrf=False)[0], 403)
        self.assertEqual(self.call("/api/shield/check", {"text": "hi", "extra": 1}, self.owner)[0], 400)
        self.assertEqual(self.call("/api/shield/check", {"text": 7}, self.owner)[0], 400)
        self.assertEqual(self.call("/api/shield/check", {"text": ""}, self.owner)[0], 400)

    def test_inbox_extract_attaches_a_warning_only_when_flagged(self):
        status, data, _ = self.call("/api/inbox/extract", {"business_id": "shapla-services", "text":
                                    "You won Tk 20,000 lottery! Send Tk 500 fee to 01811223344 to claim."}, self.owner)
        self.assertEqual(status, 200, data)
        self.assertIn("scam_shield", data)
        status, data, _ = self.call("/api/inbox/extract", {"business_id": "shapla-services", "text":
                                    "Invoice INV-2291 to Nila Traders, BDT 20,000, due 5 Dec"}, self.owner)
        self.assertEqual(status, 200, data)
        self.assertNotIn("scam_shield", data)


if __name__ == "__main__":
    unittest.main()
