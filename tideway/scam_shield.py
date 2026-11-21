"""Scam Shield: checks a pasted SMS, WhatsApp or call script for mobile-money (MFS) fraud.

Built for Bangladesh's bKash, Nagad and Rocket users: shop owners who receive payments on a
personal or merchant wallet, and the small businesses Tideway serves.  Two parts work together:

* **Explainable red-flag rules** for the scams that are actually common here: requests for a PIN
  or OTP, the "I sent money to you by mistake, please send it back" trick, fake cash-in SMS from a
  personal phone number, prize and lottery fees, account-block threats, fake official callers,
  phishing links, advance-fee loans and jobs, and changed payment numbers.
* **A small learned text model** (multinomial naive Bayes over words and character n-grams) trained
  on a labelled synthetic corpus in English, Bangla and Banglish.  It catches phrasing the rules
  have not seen, and it is reported as just one signal with its own probability.

The result is advice, never an action: Tideway does not block, report or move money.  Every
verdict tells the person how to check for themselves (open the official app or dial the official
USSD code, never call a number from the message).  Message text never gains any authority.
"""
from __future__ import annotations

import json
import math
import re
from collections import Counter
from functools import lru_cache
from pathlib import Path

CORPUS = Path(__file__).resolve().parent / "ml" / "scam_corpus.json"
MAX_TEXT = 2000
TEMPERATURE = 6.0
_BN_DIGITS = str.maketrans("০১২৩৪৫৬৭৮৯", "0123456789")

# Official sources the advice points to.  Phone numbers in a message are never trusted.
PROVIDERS = {
    "bKash": {"pattern": r"b\s?kash|বিকাশ", "helpline": "16247", "ussd": "*247#"},
    "Nagad": {"pattern": r"nagad|নগদ", "helpline": "16167", "ussd": "*167#"},
    "Rocket": {"pattern": r"rocket|রকেট|dbbl", "helpline": "16216", "ussd": "*322#"},
}
_OFFICIAL_SENDERS = re.compile(r"^(?:bkash|nagad|rocket|16247|16167|16216|dbbl|dutch-bangla)$", re.I)
_PHONE = re.compile(r"(?<!\d)(?:\+?880|0)1[3-9]\d{8}(?!\d)")
_AMOUNT = re.compile(r"(?:tk\.?|taka|৳|টাকা|bdt)\s*([\d,]+(?:\.\d{1,2})?)|([\d,]+(?:\.\d{1,2})?)\s*(?:tk|taka|৳|টাকা|bdt)\b", re.I)
_TRXID = re.compile(r"\b(?:trx\s?id|txn\s?id|transaction id|ট্রানজেকশন আইডি)\s*[:#]?\s*([A-Z0-9]{6,12})\b", re.I)

# (code, weight, regex, English reason, Bangla reason)
_RULES = (
    ("asks_secret", 65,
     r"(?:share|send|tell|give|reply|confirm|enter|bolen|bolun|din|den|janan|পাঠান|বলুন|বলেন|দিন|দেন|জানান).{0,60}"
     r"(?:\bpin\b|\botp\b|verification code|\bcode\b|password|পিন|ওটিপি|কোড|পাসওয়ার্ড)|"
     r"(?:\bpin\b|\botp\b|\bcode\b|verification code|\b\d\s?digit (?:code|number|pin)|পিন|ওটিপি|কোড)(?: number| nombor| নম্বর| নাম্বার)?\s*(?:ta|ti|টা|টি)?\s*"
     r".{0,40}(?:share|send|tell|give|reply|bolen|bolun|din|den|pathan|পাঠান|বলুন|বলেন|দিন)|"
     # "a code/number has gone to your phone - tell it to me": the OTP request without the word OTP
     r"(?:phone|mobile|sms|ফোনে|মোবাইলে|এসএমএস).{0,30}(?:\bcode\b|number|nombor|কোড|নম্বর|নাম্বার).{0,30}"
     r"(?:geche|gese|esheche|asche|ashbe|গেছে|এসেছে|আসবে|গিয়েছে).{0,40}"
     r"(?:bolen|bolun|din|den|pathan|janan|বলেন|বলুন|দিন|দেন|জানান|পাঠান)",
     "It asks for a PIN, OTP or verification code. bKash, Nagad, Rocket and banks never ask for these.",
     "পিন, ওটিপি বা ভেরিফিকেশন কোড চাওয়া হয়েছে। বিকাশ, নগদ, রকেট বা কোনো ব্যাংক কখনো এগুলো চায় না।"),
    ("wrong_send_refund", 50,
     r"by mistake|wrong(?:ly)? (?:number|send|sent)|sent .{0,20}wrongly|bhul kore|bhule|ভুল করে|ভুলে|"
     r"(?:send|give|pathan|den|ফেরত)\s*(?:it\s*)?(?:back|return|ferot)|ferot (?:pathan|den|din|dao)|ফেরত (?:দিন|দেন|পাঠান)|"
     r"please return",
     "It is the 'sent by mistake, please send it back' trick. The first SMS is often fake, or the sender reverses the payment later.",
     "এটি 'ভুল করে টাকা পাঠিয়েছি, ফেরত দিন' প্রতারণা। প্রথম এসএমএসটি প্রায়ই ভুয়া হয়।"),
    ("fee_to_receive", 60,
     r"(?:won|winner|prize|lottery|lucky draw|gift|bonus|cashback|stipend|loan|job|parcel|offer|anudan|অনুদান|পুরস্কার|লটারি|"
     r"জিতেছেন|উপহার|লোন|চাকরি|পার্সেল|lottery).{0,120}(?:\bfee\b|charge|registration|processing|clearance|deposit|ফি\b|চার্জ)|"
     r"(?:to (?:receive|claim|get|unlock|release)|nite|পেতে).{0,60}(?:send|pay|deposit|pathan|পাঠান|বিকাশ করুন|নগদ করুন)|"
     # parcel / courier "delivery charge first" (a real cash-on-delivery charge is paid on arrival)
     r"(?:delivery|courier|parcel|shipping|ডেলিভারি|কুরিয়ার|পার্সেল)\s*(?:charge|fee|cost|চার্জ|ফি|খরচ)"
     r".{0,60}(?:\bfirst\b|\bage\b|\badvance\b|\bagrim\b|before|আগে|অগ্রিম)|"
     r"(?:\bfirst\b|\bage\b|\badvance\b|আগে|অগ্রিম).{0,30}(?:delivery|courier|ডেলিভারি|কুরিয়ার)\s*(?:charge|fee|চার্জ|ফি)|"
     # job / salary offers that need an advance or deposit first
     r"(?:\bjob\b|\bkaj\b|\bchakri\b|salary|income|চাকরি|কাজ|বেতন).{0,80}(?:\badvance\b|\bdeposit\b|\bagrim\b|জামানত|অগ্রিম)|"
     r"(?:\badvance\b|\bagrim\b|অগ্রিম).{0,60}(?:\bjob\b|\bkaj\b|\bchakri\b|salary|চাকরি|কাজ|বেতন)",
     "It asks you to pay a fee to receive a prize, loan, job, gift or parcel. Real prizes never need a fee.",
     "পুরস্কার, লোন, চাকরি বা পার্সেল পেতে আগে টাকা চাওয়া হয়েছে। আসল পুরস্কারে কোনো ফি লাগে না।"),
    ("account_threat", 30,
     r"(?:account|wallet|sim|একাউন্ট|অ্যাকাউন্ট|সিম).{0,40}(?:block|suspend|close|lock|deactivat|bondho|বন্ধ|ব্লক|লক)|"
     r"(?:block|suspend|bondho|বন্ধ|ব্লক).{0,30}(?:account|একাউন্ট)|legal action|investigation|connection will be cut",
     "It threatens to block your account or take action unless you act now.",
     "একাউন্ট বন্ধ বা আইনি ব্যবস্থার ভয় দেখানো হয়েছে।"),
    ("fake_official", 25,
     r"head office|customer (?:care|service|support)|\bsupport\b|office theke|অফিস থেকে|অফিসের লোক|bangladesh bank|government|সরকারি|"
     r"(?:bkash|nagad|rocket|bank|office|বিকাশ|নগদ|রকেট|ব্যাংক)\s*(?:theke|থেকে)\s*(?:bolchi|bolsi|বলছি)|"
     r"(?:bkash|nagad|rocket) agent",
     "It claims to be from an MFS office, customer care, the government or Bangladesh Bank. Official teams do not contact you from personal numbers.",
     "নিজেকে বিকাশ/নগদ অফিস, কাস্টমার কেয়ার বা সরকারি দপ্তর বলে দাবি করছে।"),
    ("link", 30,
     r"https?://|www\.|bit\.ly|tinyurl|\.xyz\b|\.top\b|\.click\b|\.link\b",
     "It contains a link. MFS providers do not ask you to log in or enter a PIN through an SMS link.",
     "মেসেজে একটি লিংক আছে। লিংকে গিয়ে পিন দেবেন না।"),
    ("urgency", 10,
     r"urgent|immediately|right now|within \d+ (?:minutes|hours)|today only|limited|taratari|ekhoni|এখনই|জরুরি|দ্রুত|২৪ ঘণ্টা",
     "It pushes you to hurry. Pressure is a common scam tactic.",
     "তাড়াহুড়া করতে চাপ দেওয়া হচ্ছে।"),
    ("pay_personal_number", 25,
     r"(?:send|pay|deposit|bkash|nagad|করুন|পাঠান).{0,40}(?:(?:\+?880|0)1[3-9]\d{8}|০১[৩-৯][০-৯]{8})|"
     r"(?:personal|new) (?:bkash|nagad|merchant|number)|changed bank|new account",
     "It asks you to pay a personal or newly changed number. Verify by calling a number you already had, not one in this message.",
     "ব্যক্তিগত বা নতুন নাম্বারে টাকা পাঠাতে বলা হয়েছে। আগে থেকে জানা নাম্বারে ফোন করে যাচাই করুন।"),
    ("too_good", 40,
     r"double your money|earn tk [\d,]+ daily|guaranteed profit|investment group|profit \d+% per|টাকা দ্বিগুণ",
     "It promises unrealistic returns.",
     "অবাস্তব লাভের প্রতিশ্রুতি দেওয়া হয়েছে।"),
    ("secrecy", 20,
     r"do not tell|don't tell|keep (?:it )?secret|কাউকে বলবেন না|without asking",
     "It asks you to keep it secret from others.",
     "বিষয়টি গোপন রাখতে বলা হয়েছে।"),
    ("instruction_injection", 40,
     r"ignore (?:all |any )?(?:previous|prior) instructions|\bassistant\s*:|\bsystem\s*:|approve the transfer|mark .{0,30} as received",
     "It contains instructions aimed at software or an AI assistant. Tideway never follows instructions inside messages.",
     "মেসেজে সফটওয়্যার বা এআই-কে দেওয়া নির্দেশ আছে। টাইডওয়ে মেসেজের নির্দেশ মানে না।"),
)
_RULES = tuple((code, weight, re.compile(pattern, re.I), en, bn) for code, weight, pattern, en, bn in _RULES)
_ADVICE = re.compile(r"\b(?:never|do not|don['’]t)\s+(?:ask|read|share|give|tell|send|enter|reply|confirm)\b|"
                     r"\bnever asks\b|কখনো .{0,30}(?:চায় না|দেবেন না)|"
                     r"(?:দেবেন|বলবেন|পাঠাবেন|শেয়ার করবেন) না|\b(?:deben|bolben|pathaben) na\b", re.I)
_CLAUSE_BREAK = re.compile(r"[.!?;:,।\n]+|\b(?:but|however|kintu)\b|কিন্তু|তবে|"
                           r"\band\s+(?=(?:please\s+)?(?:send|tell|give|enter|reply|confirm)\b)", re.I)
# A colon or comma introducing the credential belongs to the verb's clause.
_SECRET_OBJECT_PUNCTUATION = re.compile(
    r"((?:\b(?:share|send|tell|give|reply|confirm|enter|bolen|bolun|din|den|janan)\b|পাঠান|বলুন|বলেন|দিন|দেন|জানান)"
    r"(?:\s+(?:it|us|me|with|to))*)\s*[:：,，]\s*"
    r"(?=(?:(?:your|the|a|আপনার)\s+)?(?:\b(?:pin|otp|verification code|code|password)\b|পিন|ওটিপি|কোড|পাসওয়ার্ড))",
    re.I,
)
# "No fee is charged" is the opposite of an advance-fee demand.
_NO_FEE = re.compile(r"\bno (?:fee|charge)s?\b|without (?:any )?(?:fee|charge)|free of (?:charge|cost)|"
                     r"\b(?:fee|charge) (?:is|will be) not\b|ফি লাগে না|কোনো ফি নেই|কোনো চার্জ নেই|চার্জ লাগে না", re.I)
_RECEIVED = re.compile(r"received|cash\s?in|joma|জমা|পেয়েছেন|credited|deposited", re.I)
_TXN_NOTICE = re.compile(r"(?:received|cash\s?in|payment|send money|cash out).{0,80}(?:balance|trx\s?id|txn\s?id)", re.I)


# ---- the learned part: multinomial naive Bayes ---------------------------------------------------

def features(text):
    """Words plus character 3-5 grams (works for Bangla script and Banglish spelling variants)."""
    folded = str(text).casefold().translate(_BN_DIGITS)
    folded = _PHONE.sub(" PHONE ", folded)
    folded = re.sub(r"\d[\d,.]*", " NUM ", folded)
    words = re.findall(r"[\wঀ-৿]+", folded)
    grams = []
    for word in words:
        padded = f" {word} "
        grams += [padded[i:i + n] for n in (3, 4, 5) for i in range(max(0, len(padded) - n + 1))]
    return ["w:" + word for word in words] + ["c:" + gram for gram in grams]


class NaiveBayes:
    def __init__(self, alpha=0.5):
        self.alpha = alpha
        self.counts = {"scam": Counter(), "legit": Counter()}
        self.docs = Counter()

    def fit(self, rows):
        for text, label in rows:
            self.docs[label] += 1
            self.counts[label].update(features(text))
        self.vocab = set(self.counts["scam"]) | set(self.counts["legit"])
        self.totals = {label: sum(counter.values()) for label, counter in self.counts.items()}
        return self

    def _log_likelihood(self, label, token):
        return math.log((self.counts[label][token] + self.alpha) / (self.totals[label] + self.alpha * len(self.vocab)))

    def probability(self, text):
        """P(scam | text), with the tokens that pushed hardest toward 'scam'."""
        tokens = [token for token in features(text) if token in self.vocab]
        total = sum(self.docs.values())
        score = {label: math.log(self.docs[label] / total) for label in self.counts}
        evidence = Counter()
        for token in tokens:
            for label in self.counts:
                score[label] += self._log_likelihood(label, token)
            if token.startswith("w:"):
                evidence[token[2:]] += self._log_likelihood("scam", token) - self._log_likelihood("legit", token)
        # Naive Bayes treats overlapping n-grams as independent, which makes raw posteriors far too sure.
        # Calibrate on the mean log-likelihood ratio per feature instead (temperature chosen on the corpus).
        n = max(1, len(tokens))
        prior = math.log(self.docs["scam"] / self.docs["legit"])
        log_odds = prior + (score["scam"] - score["legit"] - prior) / n * TEMPERATURE
        probability = 1 / (1 + math.exp(-max(-30.0, min(30.0, log_odds))))
        top = [word for word, weight in evidence.most_common(4) if weight > 0.5 and word not in ("num", "phone")]
        return probability, top


def load_corpus():
    data = json.loads(CORPUS.read_text(encoding="utf-8"))
    return [(row["text"], row["label"]) for row in data["messages"]]


def split(rows, every=5):
    """Deterministic hold-out: every 5th message of each label is held out for evaluation."""
    train, held = [], []
    seen = Counter()
    for text, label in rows:
        seen[label] += 1
        (held if seen[label] % every == 0 else train).append((text, label))
    return train, held


@lru_cache(maxsize=1)
def model():
    return NaiveBayes().fit(load_corpus())


def evaluate():
    """Hold-out accuracy of the learned model alone and of the full shield (rules + model), on synthetic data."""
    train, held = split(load_corpus())
    learned = NaiveBayes().fit(train)
    rows = []
    for text, label in held:
        p, _ = learned.probability(text)
        verdict = check(text, _model=learned)["verdict"]
        rows.append({"label": label, "model_scam": p >= 0.5, "shield_flag": verdict != "no_red_flags"})

    def metrics(key):
        tp = sum(r[key] and r["label"] == "scam" for r in rows)
        fp = sum(r[key] and r["label"] == "legit" for r in rows)
        fn = sum(not r[key] and r["label"] == "scam" for r in rows)
        tn = sum(not r[key] and r["label"] == "legit" for r in rows)
        return {"accuracy": round((tp + tn) / len(rows), 3), "recall_scam": round(tp / max(1, tp + fn), 3),
                "false_alarm_rate": round(fp / max(1, fp + tn), 3), "tp": tp, "fp": fp, "fn": fn, "tn": tn}

    return {"train_messages": len(train), "held_out_messages": len(held), "synthetic_data": True,
            "learned_model_only": metrics("model_scam"), "rules_plus_model": metrics("shield_flag")}


TESTSET = Path(__file__).resolve().parent / "ml" / "scam_testset.json"


def evaluate_independent():
    """The shipped shield on a separate hand-written test set that is never used for training."""
    rows = json.loads(TESTSET.read_text(encoding="utf-8"))["messages"]
    training = {text for text, _label in load_corpus()}
    verdicts = [(row["label"], check(row["text"], row.get("sender", ""))["verdict"]) for row in rows]
    scams = [verdict for label, verdict in verdicts if label == "scam"]
    legit = [verdict for label, verdict in verdicts if label == "legit"]
    return {"messages": len(rows), "overlap_with_training": sum(row["text"] in training for row in rows),
            "scams": len(scams), "scams_likely": scams.count("likely_scam"), "scams_suspicious": scams.count("suspicious"),
            "scams_missed": scams.count("no_red_flags"), "legit": len(legit),
            "false_alarms": sum(verdict != "no_red_flags" for verdict in legit), "synthetic_data": True}


# ---- the check -----------------------------------------------------------------------------------

def _amount(text):
    match = _AMOUNT.search(text)
    if not match:
        return None
    raw = (match.group(1) or match.group(2) or "").replace(",", "")
    try:
        return float(raw)
    except ValueError:
        return None


def _provider(text):
    for name, info in PROVIDERS.items():
        if re.search(info["pattern"], text, re.I):
            return name
    return None


def check(text, sender="", _model=None):
    """Assess one message.  Returns verdict, 0-100 risk score, reasons (English and Bangla) and safe next steps."""
    if not isinstance(text, str) or not text.strip():
        raise ValueError("Paste the message text to check.")
    if len(text) > MAX_TEXT:
        raise ValueError(f"Message must be at most {MAX_TEXT:,} characters.")
    sender = str(sender or "").strip()[:40]
    normal = text.translate(_BN_DIGITS)
    signals = []

    def add(code, weight, en, bn, **extra):
        signals.append({"code": code, "weight": weight, "en": en, "bn": bn, **extra})

    for code, weight, pattern, en, bn in _RULES:
        if code == "asks_secret":
            # A safety reminder only negates a request in its own clause.
            matched = any(pattern.search(clause) and not _ADVICE.search(clause)
                          for clause in _CLAUSE_BREAK.split(_SECRET_OBJECT_PUNCTUATION.sub(r"\g<1> ", normal)))
        elif code == "fee_to_receive":
            matched = pattern.search(normal) and not _NO_FEE.search(normal)
        else:
            matched = pattern.search(normal)
        if matched:
            add(code, weight, en, bn)

    provider = _provider(normal)
    looks_like_notice = bool(_TXN_NOTICE.search(normal))
    normalized_sender = re.sub(r"[\s-]+", "", sender.translate(_BN_DIGITS))
    sender_is_phone = bool(_PHONE.fullmatch(normalized_sender)) if sender else False
    if sender_is_phone and (looks_like_notice or (provider and _RECEIVED.search(normal))):
        add("notice_from_phone_number", 70,
            "It looks like an official transaction SMS but came from a personal phone number. Real bKash, Nagad and Rocket "
            "notices come from the provider's own sender name, not an 01X number.",
            "এটি দেখতে লেনদেনের অফিসিয়াল এসএমএস, কিন্তু এসেছে একটি ব্যক্তিগত নাম্বার থেকে। আসল এসএমএস আসে বিকাশ/নগদ/রকেট নামে।")
    claims_received = bool(_RECEIVED.search(normal)) and _amount(normal) is not None
    if claims_received and any(s["code"] == "wrong_send_refund" for s in signals):
        add("received_then_return", 20,
            "It says money arrived and then asks for it back. Check your real balance first; never return money from an SMS alone.",
            "টাকা জমা হয়েছে বলে আবার ফেরত চাইছে। আগে অ্যাপে আসল ব্যালেন্স দেখুন।")

    learned = _model or model()
    probability, top_words = learned.probability(normal)
    # A genuine provider notice ("your code is 482910, never share it") uses the same words as scams; with no rule
    # signal, a safety reminder in the message means the model alone does not raise an alarm.
    if not signals and _ADVICE.search(normal):
        probability_signal = 0.0
    else:
        probability_signal = probability
    if probability_signal >= 0.95:
        add("learned_model", 35, f"Tideway's text model finds it very similar to known scam messages ({round(probability * 100)}%).",
            f"টাইডওয়ের এআই মডেল এটিকে পরিচিত প্রতারণার মেসেজের খুব কাছাকাছি দেখছে ({round(probability * 100)}%)।", words=top_words)
    elif probability_signal >= 0.9:
        add("learned_model", 30, f"Tideway's text model finds it very similar to known scam messages ({round(probability * 100)}%).",
            f"টাইডওয়ের এআই মডেল এটিকে পরিচিত প্রতারণার মেসেজের মতো দেখছে ({round(probability * 100)}%)।", words=top_words)
    elif probability_signal >= 0.75:
        add("learned_model", 15, f"Tideway's text model finds some similarity to scam messages ({round(probability * 100)}%).",
            f"টাইডওয়ের এআই মডেল কিছু মিল খুঁজে পেয়েছে ({round(probability * 100)}%)।", words=top_words)

    score = min(100, sum(signal["weight"] for signal in signals))
    critical = any(s["code"] in ("asks_secret", "notice_from_phone_number") for s in signals)
    verdict = "likely_scam" if critical or score >= 60 else "suspicious" if score >= 25 else "no_red_flags"
    signals.sort(key=lambda s: -s["weight"])

    info = PROVIDERS.get(provider) if provider else None
    actions = []
    if any(s["code"] == "asks_secret" for s in signals):
        actions.append(("Do not share your PIN, OTP or any code with anyone, including people who say they are from the office.",
                        "পিন, ওটিপি বা কোনো কোড কাউকে দেবেন না, অফিসের লোক বললেও না।"))
    if claims_received or any(s["code"] in ("wrong_send_refund", "notice_from_phone_number") for s in signals):
        check_en = f"Check your balance in the official {provider} app or by dialling {info['ussd']}" if info else \
            "Check your balance in the official app or by dialling the provider's USSD code"
        check_bn = f"অফিসিয়াল {provider} অ্যাপে বা {info['ussd']} ডায়াল করে ব্যালেন্স দেখুন" if info else \
            "অফিসিয়াল অ্যাপে বা ইউএসএসডি কোড ডায়াল করে ব্যালেন্স দেখুন"
        actions.append((check_en + " before handing over goods or sending anything back.",
                        check_bn + "। তারপরই মাল দিন; শুধু এসএমএস দেখে কখনো টাকা ফেরত দেবেন না।"))
    if any(s["code"] == "wrong_send_refund" for s in signals):
        actions.append(("If money really arrived by mistake, ask the sender to raise it with the provider's helpline; the provider reverses it, not you.",
                        "সত্যিই ভুল করে টাকা এলে প্রেরককে হেল্পলাইনে অভিযোগ করতে বলুন; প্রোভাইডারই টাকা ফেরত নেবে।"))
    if any(s["code"] in ("link", "fake_official", "account_threat") for s in signals):
        actions.append(("Do not open the link or call numbers in the message. Contact the provider only through its official app or helpline.",
                        "লিংকে যাবেন না, মেসেজের নাম্বারে ফোন করবেন না। শুধু অফিসিয়াল অ্যাপ বা হেল্পলাইনে যোগাযোগ করুন।"))
    if any(s["code"] in ("pay_personal_number", "fee_to_receive", "too_good") for s in signals):
        actions.append(("Do not pay. Verify a changed payment number by calling the number you already had on file.",
                        "টাকা পাঠাবেন না। নাম্বার বদলের কথা বললে আগের জানা নাম্বারে ফোন করে যাচাই করুন।"))
    if verdict != "no_red_flags":
        helpline = f"{provider} helpline {info['helpline']}" if info else "the official helpline of your bank or MFS provider"
        actions.append((f"Report it to {helpline}. Keep the message as evidence.",
                        f"{('হেল্পলাইন ' + info['helpline']) if info else 'অফিসিয়াল হেল্পলাইনে'} জানান। মেসেজটি প্রমাণ হিসেবে রাখুন।"))
    else:
        actions.append(("No known red flags found, but that is not proof. For money received, always confirm the balance in the official app.",
                        "পরিচিত কোনো ঝুঁকির চিহ্ন পাওয়া যায়নি, তবে এটা নিশ্চয়তা নয়। টাকা পেলে সবসময় অফিসিয়াল অ্যাপে ব্যালেন্স দেখুন।"))

    trx = _TRXID.search(normal)
    phones = sorted(set(_PHONE.findall(normal)))
    return {
        "verdict": verdict, "risk_score": score, "provider": provider,
        "sender": sender or None, "sender_is_phone_number": sender_is_phone,
        "claims": {"money_received": claims_received, "amount_bdt": _amount(normal),
                   "transaction_id": trx.group(1) if trx else None, "phone_numbers_in_message": phones},
        "model": {"name": "Scam Shield naive Bayes (words + character n-grams)", "probability_scam": round(probability, 3),
                  "top_words": top_words, "training": "synthetic labelled corpus (scam-corpus-v2)"},
        "signals": signals,
        "actions": [{"en": en, "bn": bn} for en, bn in actions],
        "advisory_only": True,
        "note": "Advice only: Tideway saved nothing, blocked nothing and moved no money. Message text never gains authority.",
    }
