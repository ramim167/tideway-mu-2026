# Tideway at the MU AI Builders Hackathon 2026

**Competition:** Metropolitan University Inter-University AI Builders Hackathon 2026, powered by Phitron (MU CSE Fest 2026, Sylhet)
**Track:** 04 — FinTech & Financial Intelligence ("digital finance, fraud detection, financial literacy and financial inclusion")
**Project:** Tideway, an AI cash-flow and fraud-safety copilot for Bangladeshi small businesses
**Team:** The Last BrainCell, BUET (3–4 registered members; see `submission-team.public.json`)

The organisers confirmed that an existing project may be adapted for the preliminary round. Tideway was first built for
FinTechathon 2026 (Shenzhen); that material is kept in [`archive/fintechathon-2026/`](archive/fintechathon-2026/).

## 1. Preliminary round: what we submit

| Requirement (rulebook §3.3) | Our item | Status |
|---|---|---|
| Project idea proposal, one PDF, max 3 pages: problem, AI solution, target users and impact, innovation and feasibility, business model and sustainability | [`proposal/Tideway_MU_AI_Builders_2026_Proposal.pdf`](proposal/Tideway_MU_AI_Builders_2026_Proposal.pdf) (source: `proposal/proposal.html`) | Ready; upload to Google Drive, share as "anyone with the link" |
| Team Leader's GitHub profile URL | Leader's profile, with this repository public and pinned | Team to confirm |
| Idea presentation video, max 5 minutes, introduces every member and their role; segments: problem, solution, workflow, AI approach, impact | Not made yet (deferred by the team) | To do |
| Track selection | FinTech & Financial Intelligence | Select on the form |
| Leader joins the hackathon WhatsApp group before filling the form | — | Team to do |

Deadline: **20 November 2026**. Top 50 + 10 waiting-list teams announced 25 November.

## 2. How Tideway meets the preliminary judging criteria

The rulebook (§3.4) judges problem relevance, innovation, feasibility, proposed AI approach, expected impact, presentation
quality and team preparedness.

| Criterion | Evidence in this repository |
|---|---|
| **Problem relevance** | Bangladeshi SMEs run on mobile money with no finance team: late customer payments break payroll, and MFS scams (fake cash-in SMS, PIN/OTP theft, "sent by mistake" refunds) hit shopkeepers directly. Demo businesses are three Sylhet firms keeping BDT books. |
| **Innovation** | One copilot joins cash-flow forecasting, rescue planning, MFS fraud checking and a verifiable credit passport. The AI can only propose; a signed, single-use mandate approved by people is the only path to money moving. |
| **Feasibility** | A working local prototype exists: standard-library Python, no paid API, runs offline on a laptop. 679 automated tests and a 30-case attack self-test (25/25 attacks blocked). |
| **AI approach** | TidePay (lateness prediction, federated training), TideLM (fine-tuned small LLM that turns questions and alerts into typed tool plans), the Scam Shield text model (naive Bayes over words and character n-grams) and Monte Carlo cash simulation. Every model output is checked by validators. |
| **Expected impact** | Earlier warning of payroll gaps, cheaper rescue than informal borrowing, fewer MFS fraud losses, and a path to formal credit through the credit passport. Claims stay honest: no pilot users or field accuracy are claimed yet. |
| **Presentation quality** | README with a judge-facing feature map, every page of the UI self-explains, answers in বাংলা. |
| **Team preparedness** | Commit history, test suite, evaluation scripts and evidence files show sustained engineering. |

## 3. Track themes → features

| Theme | Feature | Code |
|---|---|---|
| Fraud detection | Scam Shield; payment-integrity scan; payee-change and look-alike blocks; injection quarantine | `tideway/scam_shield.py`, `tideway/treasury.py`, `tideway/screening.py` |
| Financial literacy | Bangla assistant; plain-language help layer with 40 finance terms; "why this plan" explanations | `tideway/i18n_bn.py`, `tideway/conversation.py`, `web/helper.js` |
| Financial inclusion | Ed25519-signed credit passport verifiable offline; lender portfolio radar for a Bangladeshi SME book; free Starter plan | `tideway/treasury.py`, `tideway/portfolio.py`, `tideway/store.py` |
| Digital finance | bKash/Nagad/Rocket/bank alert extraction, 14-day forecast with 1,000 simulated futures, rescue planner, signed mandates | `tideway/inbox_rules.py`, `tideway/projection.py`, `tideway/planner.py` |

## 4. Changes made for this competition (v16)

- **Scam Shield** (new): MFS fraud check with bilingual reasons and safe next steps; runs automatically on Inbox messages. API `POST /api/shield/check`; UI view *Scam Shield*; 14 tests.
- **বাংলা assistant** (new): Bangla-script detection, all reply templates and suggestions in Bangla, Bangla-digit parsing, Bangla small talk and question routing to the same tools; 8 tests.
- **Bangladesh demo data:** all three demo businesses are now Sylhet firms keeping BDT books (Lotus Print Studio, Haorline Traders, Shapla Services); the lender portfolio is a Bangladeshi SME book in BDT.
- **BDT pricing:** free Starter, Growth ৳990/month (illustrative, never charged).
- **Rebrand:** FinTechathon/Shenzhen references removed from the UI, API metadata and README; old contest documents archived.
- **Proposal:** 3-page PDF in MU's required section order.

## 5. Grand Finale reminders (4–5 December)

The finale is a **new, unrelated problem** built from scratch in a **new GitHub repository**; pre-built projects are not
allowed there, so Tideway is not reused at the finale. All members must be on site for 24 hours. Scoring: relevance 5,
functionality 20, implementation quality 15, UI/UX 15, AI integration 15, teamwork 10, innovation 5, presentation 15.
Bring student IDs, laptops, chargers, a multi-plug and a mobile hotspot.
