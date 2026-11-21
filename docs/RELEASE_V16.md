# Release v16: MU AI Builders Hackathon edition

MoneyGuard adapted for the MU CSE Fest 2026 AI Builders Hackathon, track 04 FinTech & Financial Intelligence.

## New

- **Scam Shield.** MFS fraud check for bKash, Nagad and Rocket messages: explainable rules plus a naive Bayes text model,
  bilingual reasons and next steps, sender check for fake cash-in SMS. New view, `POST /api/shield/check`, automatic
  Inbox warning. See [SCAM_SHIELD.md](SCAM_SHIELD.md).
- **বাংলা assistant.** Bangla-script questions are detected and answered in Bangla using the same tools and figures as
  English. Bangla digits, small talk, payroll, risk, late payers, what-if, credit check, rescue plan, explanation and
  money-refusal flows. Templates in `tideway/i18n_bn.py`.

## Changed

- Demo businesses are three Sylhet firms keeping BDT books; counterparties renamed (Surma Paper Mills, Jalalabad Media,
  Zindabazar Events, Meghna Steel, Kushiara Wholesale). Business IDs are unchanged.
- Lender portfolio radar models a Bangladeshi SME book in BDT.
- Plans priced in BDT (Starter free, Growth ৳990/month, illustrative).
- UI, API metadata (`track`, version 4.0.0), README and hero image rebranded for the MU hackathon.
- Earlier contest documents moved to `docs/archive/fintechathon-2026/`.

## Tests

New: `tests/test_scam_shield.py` (14), `tests/test_bangla.py` (8). One portfolio test updated: the synthetic lender is
now single-currency (BDT). Self-test: 5/5 tasks, 25/25 attacks blocked.

## Not changed

Approval gating, signed mandates, audit chain, tenant isolation and every security control behave as in v15.
Older evidence files under `evidence/` describe v15 runs and keep their original fixture names.

## Redesign for everyday owners ("MoneyGuard Aurora")

- **Home** is the first screen: one plain answer ("Salary money will run short"), four key numbers, four big task
  cards, a day-by-day cash chart, who owes you and which bills are blocked for fraud. Nothing on it moves money.
- **One English / বাংলা switch** for page names, Home, help cards, the cash-forecast owner view and Scam check.
- **Plain page names** grouped as Every day (Home, Cash forecast, Fix a cash gap, Ask MoneyGuard, Scam check, Add from SMS),
  Plan and records, and **More tools** for accountants and lenders (Decision lab, Bank reports, Lender radar,
  Safety settings, Audit trail).
- **Fix a cash gap** opens with a plain summary: each step in one sentence, total cost, whether salaries can be paid,
  who must agree, and one approve button.
- **Phones** get an app-style bottom tab bar (Home, Fix gap, Ask, Scam check, Menu).
- **Visual style ("Emerald & Champagne"):** obsidian-emerald base, champagne-gold accents used sparingly, warm ivory pages, aurora-lit hero surfaces, bento cards and flat,
  high-contrast number cards; landing content no longer hides until scrolled.
- The end-to-end browser test (`node scripts/capture_screens.mjs`) now covers Home, the Bangla switch and Scam check,
  and passes with the owner-view, decision-lab and 406-combination currency checks.
- **A colour pairing for every page:** each page has its own two-colour mesh gradient (for example violet and pink
  for Ask MoneyGuard, crimson and orange for Scam check, rust and amber for Fix a cash gap, midnight blue and cyan for
  Cash forecast). It runs through the header band, quick-start panel, active menu item, buttons and accents. White
  text on every button colour is 5.2:1 to 10.4:1.

## Full বাংলা interface

- **Two clear options, one language at a time:** an English | বাংলা switch in the app header and on the landing page.
  The menu, headers and every page show only the chosen language.
- **Every page in Bangla:** a translation layer (`web/i18n-bn.js`, dictionary `web/i18n-bn-dict.js`, 1,383 entries)
  converts all interface text (buttons, labels, headings, tables, dialogs, dropdowns, placeholders, the tour and
  glossary) and restores English when switched back. Business data (names, amounts, dates, record text) is never
  translated; numbers, amounts, dates and ledger names inside sentences pass through as placeholders.
- **Checked automatically:** `node scripts/bangla_coverage.mjs --strict` walks 33 page states in Bangla (landing,
  Home, forecast, rescue plan, approval dialog, assistant, Scam check, Inbox drafts, What if, Records, Team, every
  Decision lab and Bank reports tab, Lender radar, Safety self-test, Audit drill, a fraud-blocked business and a
  viewer) and fails if any interface text is still English. Current result: 0.
