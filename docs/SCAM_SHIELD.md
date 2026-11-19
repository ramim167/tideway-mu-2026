# Scam Shield

Scam Shield checks a pasted mobile-financial-service (MFS) message, such as a bKash, Nagad or Rocket SMS, a WhatsApp
message or a caller's script, for fraud before the person acts on it. It is advice only: it saves nothing, blocks nothing
and moves no money.

- Code: [`tideway/scam_shield.py`](../tideway/scam_shield.py)
- Corpus: [`tideway/ml/scam_corpus.json`](../tideway/ml/scam_corpus.json)
- Tests: [`tests/test_scam_shield.py`](../tests/test_scam_shield.py)
- UI: *Scam Shield* view ([`web/shield.js`](../web/shield.js)); a warning also appears in the *Inbox*
- API: `POST /api/shield/check` with `{"text": "...", "sender": "optional"}` (any signed-in member; session and CSRF required)

## Why it exists

Shopkeepers and small firms in Bangladesh take payments on MFS wallets. Common losses come from:

1. **Fake cash-in SMS.** A message that copies the real "You have received Tk …" format, sent from a personal number.
   The goods are handed over; no money ever arrived.
2. **"Sent by mistake, please send it back".** Often follows a fake SMS, or the sender later reverses a real payment.
3. **PIN/OTP theft.** Callers or messages posing as the provider's office, customer care or the government.
4. **Advance fees.** Prizes, lotteries, loans, jobs, stipends or parcels that need a "registration" or "release" fee.
5. **Phishing links and account-block threats.**
6. **Changed payment numbers.** "Pay our new personal bKash from today; do not tell the manager."

## How it decides

**Rules (explainable).** Each rule has a weight and an English and Bangla reason. Rules cover all six patterns above
plus urgency, secrecy, unrealistic returns and instruction-injection text. Safety advice such as "bKash never asks for
your PIN" is recognised and not flagged, unless the same message goes on to ask for a code.

**Sender check.** If the optional sender is an 11-digit 01X number and the text looks like an official transaction
notice, Scam Shield flags it as a likely scam. The text of a fake cash-in SMS can be identical to a real one; who sent
it is what gives it away.

**Learned model.** A multinomial naive Bayes classifier over words and character 3–5-grams. Character n-grams let it
cope with Bangla script and the many Banglish spellings ("ferot", "pathan", "bolen"). Naive Bayes is badly
over-confident on overlapping n-grams, so the probability is calibrated on the mean log-likelihood ratio per feature
(temperature 6). The model adds a signal only at P(scam) ≥ 0.75 (weight 15) or ≥ 0.9 (weight 30), so it can raise
"suspicious" on its own but never "likely scam" alone.

**Verdict.** Likely scam if a PIN/OTP request or a fake notice from a phone number is found, or the score is 60 or more;
Suspicious at 25–59; otherwise No known red flags, always with the reminder to confirm received money in the official app.

**Next steps.** Check the balance in the official app or USSD code (bKash `*247#`, Nagad `*167#`, Rocket `*322#`); never
return money because of an SMS; do not open links or call numbers from the message; report to the official helpline
(bKash 16247, Nagad 16167, Rocket 16216). Verify these numbers on the providers' own websites before publishing.

## Evaluation (honest limits)

The corpus has 104 hand-written synthetic messages (48 scam, 56 legitimate) in English, Bangla and Banglish. No message
comes from a real person. A deterministic hold-out (every fifth message of each label, 20 messages) gives:

| | Accuracy | Scam recall | False alarm rate |
|---|---|---|---|
| Learned model alone | 85% | 100% (9/9) | 27% (3/11) |
| Rules + model (the shipped shield) | 100% | 100% (9/9) | 0% (0/11) |

The rules were written by the same people who wrote the corpus, so the combined score is optimistic. The next step is a
consented, anonymised set of real scam reports, for example from MFS providers' public awareness campaigns, with a
held-out set nobody on the team has read.

```bash
python -c "from tideway import scam_shield; print(scam_shield.evaluate())"
python -m unittest tests.test_scam_shield
```
