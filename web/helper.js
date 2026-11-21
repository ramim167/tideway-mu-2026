"use strict";

// Plain-language help layer. It only adds explanations and navigation shortcuts;
// it never calls the API, approves, executes or changes records. Any failure here
// is contained so the financial UI keeps working without help.
window.TidewayHelp = (() => {
  const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c]));
  const store = {
    get(key, fallback) { try { const v = localStorage.getItem(key); return v === null ? fallback : v; } catch { return fallback; } },
    set(key, value) { try { localStorage.setItem(key, value); } catch { /* preference is optional */ } },
  };

  // ---- What each page is for, in everyday words ----------------------------
  // Bangla help for the everyday pages; other pages fall back to English.
  const PAGES_BN = {
    home: {what: "এক নজরে আপনার ব্যবসা: বেতন দিতে পারবেন কি না, নগদ কত নিচে নামবে, কে টাকা বাকি রেখেছে, আর এখন কী করবেন।", who: "সবাই",
      steps: ["প্রথমে বড় রঙিন বাক্সটি পড়ুন: সবুজ মানে ঠিক আছে, হলুদ মানে সাবধান, লাল মানে এখনই ব্যবস্থা নিন।",
        "“কীভাবে ঠিক করব দেখান” চাপলে অনুমোদনের জন্য একটি পরিকল্পনা পাবেন, অথবা বাংলায় প্রশ্ন করুন।",
        "অদ্ভুত বিকাশ বা ব্যাংকের এসএমএস পেলে মাল বা টাকা দেওয়ার আগে “সন্দেহজনক এসএমএস যাচাই” ব্যবহার করুন।"],
      safe: "শুধু দেখার জন্য। এই পাতা থেকে কোনো টাকা নড়ে না।"},
    overview: {what: "দরকারি দিনে (যেমন বেতনের দিন) ব্যবসায় যথেষ্ট টাকা থাকবে কি না, আর ঘাটতির সম্ভাবনা কত, তা এখানে দেখা যায়।", who: "সবাই",
      steps: ["আবহাওয়া পড়ুন: পরিষ্কার মানে ঠিক আছে, অস্থির মানে সাবধান, ঝড় মানে টাকা কম পড়ার সম্ভাবনা।",
        "সবচেয়ে কম টাকার দিনটি খুঁজুন এবং নিরাপত্তার টাকার সাথে মিলিয়ে দেখুন।",
        "কিছু কেনার কথা ভাবছেন? আগে “খরচ যাচাই” করে দেখুন।"],
      safe: "শুধু দেখার জন্য। এই পাতা থেকে কোনো টাকা নড়ে না।"},
    rescue: {what: "টাকার ঘাটতি আসছে? টাইডওয়ে সমাধান খুঁজে দেয়: সরবরাহকারীকে পরে টাকা দেওয়া, আগে টাকা দিলে ক্রেতাকে ছোট ছাড়, বা রিমাইন্ডার। সিদ্ধান্ত মানুষের।", who: "মালিক ও হিসাবরক্ষক অনুমোদন করেন; দর্শক দেখতে পারেন",
      steps: ["খরচ, বাকি ঝুঁকি আর কাদের রাজি হতে হবে তা তুলনা করুন।", "নিজের পিন দিয়ে অনুমোদন করুন। বড় অঙ্কে দ্বিতীয় একজন লাগবে।",
        "কার্যকর করা আলাদা ও শেষ ধাপ, এবং তা শুধু অনুশীলন মোডে হয়।"],
      safe: "এআই প্রস্তাব দিতে পারে, কিন্তু কখনো অনুমোদন বা কার্যকর করতে পারে না। প্রতিটি অনুমোদনে মানুষ ও পিন লাগে।"},
    assistant: {what: "সহজ ভাষায়, বাংলা বা ইংরেজিতে প্রশ্ন করুন; উত্তর আসে টাইডওয়ের নিজের হিসাব থেকে।", who: "সবাই",
      steps: ["আজকের অবস্থার সারাংশ পেতে “আসসালামু আলাইকুম” লিখুন।", "জিজ্ঞেস করুন, যেমন “Nila Traders যদি ২০ দিন দেরিতে টাকা দেয়?”",
        "কোন হিসাব ব্যবহার হয়েছে তা উত্তরের নিচে দেখা যায়।"],
      safe: "সহকারী পড়তে ও ব্যাখ্যা করতে পারে। টাকা নাড়াতে বা রেকর্ড বদলাতে পারে না।"},
    shield: {what: "বিকাশ, নগদ বা রকেটের এসএমএস বা ফোন কল সন্দেহজনক লাগছে? এখানে পেস্ট করুন। প্রতারণা কি না, কেন, আর কী করবেন তা জানাবে।", who: "সবাই",
      steps: ["মেসেজটি পেস্ট করুন, পারলে ফোনে দেখানো প্রেরকের নামও দিন।",
        "রায় ও প্রতিটি কারণ পড়ুন। “টাকা পেয়েছেন” এসএমএস কোনো ফোন নাম্বার থেকে এলে তা বড় সতর্কসংকেত।",
        "ধাপগুলো মানুন: অফিসিয়াল অ্যাপে ব্যালেন্স দেখুন, পিন বা ওটিপি দেবেন না, শুধু এসএমএস দেখে টাকা ফেরত দেবেন না।"],
      safe: "শুধু পরামর্শ। কিছুই সংরক্ষণ, আটকানো বা পরিশোধ হয় না। সতর্কতা না থাকলেও মেসেজটি আসল তা প্রমাণ হয় না।"},
    learn: {what: "ব্যবসার টাকা সামলানোর ছয়টি ছোট পাঠ: নিরাপত্তার টাকা, বেতনের দিন, দেরিতে টাকা দেওয়া ক্রেতা, এক ক্রেতার ওপর নির্ভরতা, মোবাইল ব্যাংকিং প্রতারণা আর ঋণ। প্রতিটি আপনার নিজের হিসাব দিয়ে বোঝানো।", who: "সবাই",
      steps: ["একটি পাঠ খুলে “আপনার হিসাব” অংশটি পড়ুন।", "শেষের ছোট প্রশ্নের উত্তর দিন; ঠিক হলে পাঠটি শেষ হিসেবে চিহ্নিত হয়।", "পাঠের নিচের বোতাম দিয়ে সংশ্লিষ্ট পাতায় গিয়ে কাজটি করুন।"],
      safe: "শুধু শেখার জন্য। কোনো হিসাব বদলায় না, টাকা নড়ে না। অগ্রগতি শুধু এই ব্রাউজারে থাকে।"},
    records: {what: "প্রতিটি হিসাবের পেছনের খাতা: আপনার পাওনা চালান, আপনার দেনা বিল আর আগের লেনদেন।", who: "সবাই",
      steps: ["ধরন বেছে নিন বা ক্রেতা ও সরবরাহকারীর নাম খুঁজুন।", "লাল চিহ্ন মানে ব্যাংক তথ্য বদলেছে বা লেখা সন্দেহজনক।",
        "প্রমাণের রেকর্ড পাতা থেকে স্প্রেডশিটে এক্সপোর্ট করুন।"],
      safe: "খাতা দেখলে কিছুই বদলায় না। সন্দেহজনক লেখা আলাদা করে শুধু তথ্য হিসেবে দেখানো হয়।"},
    team: {what: "এই ব্যবসার জন্য কে দেখতে ও কাজ করতে পারেন। এককালীন কোড দিয়ে ঠিক ভূমিকায় সহকর্মীদের আমন্ত্রণ জানান।", who: "মালিক টিম সামলান",
      steps: ["মালিক: নীতি ও এজেন্ট আবার চালুসহ পূর্ণ নিয়ন্ত্রণ।", "হিসাবরক্ষক: পরিকল্পনা প্রস্তাব ও অনুমোদন করতে পারেন।",
        "দর্শক: শুধু দেখতে পারেন, কিছু অনুমোদন করতে পারেন না।"],
      safe: "প্রতিটি অনুরোধ সদস্যপদ মিলিয়ে দেখা হয়, তাই এক ব্যবসা অন্য ব্যবসার তথ্য দেখে না।"},
    lab: {what: "ভরসা করার আগে পরিকল্পনা যাচাই করুন: কোনো ক্রেতা কত দেরি করলে পরিকল্পনা ভেঙে যায়, আর ঝুঁকির তুলনায় কোন সমাধান সবচেয়ে সস্তা।", who: "বিশ্লেষক, মালিক ও হিসাবরক্ষক",
      steps: ["প্রতিটি ক্রেতার জন্য ভাঙনের সীমা খুঁজুন।", "সমাধানের বিকল্পগুলো পাশাপাশি তুলনা করুন।",
        "কিছু পাঠানোর আগেই দেখুন ক্লাউড AI ঠিক কী দেখবে।"],
      safe: "শুধু বিশ্লেষণ। এখানে প্রস্তাবিত যেকোনো পরিবর্তনে স্বাভাবিক অনুমোদন লাগে।"},
    treasury: {what: "ব্যাংকের মানের রিপোর্ট এক জায়গায়: ১৩ সপ্তাহের নগদ পরিকল্পনা, ব্যবসার স্বাস্থ্য স্কোর, দ্বৈত বা অস্বাভাবিক পেমেন্টের যাচাই, আর ঋণদাতাকে দেখানোর মতো স্বাক্ষরিত ক্রেডিট পাসপোর্ট।", who: "হিসাব বিভাগ, মালিক ও ঋণদাতা",
      steps: ["সপ্তাহভিত্তিক টেবিল পড়ুন, কোন সপ্তাহে নগদ নিরাপত্তার টাকার নিচে যায় দেখুন।",
        "স্বাস্থ্য স্কোর আর কোন পরামর্শে তা সবচেয়ে বাড়ে দেখুন।",
        "পেমেন্ট যাচাই চালান; ক্রেডিট পাসপোর্ট তৈরি ও যাচাই করুন।"],
      safe: "রিপোর্টগুলো শুধু পড়ার জন্য। পাসপোর্ট তৈরি অডিট ট্রেইলে লেখা থাকে; কোনো টাকা নড়ে না।"},
    portfolio: {what: "ব্যাংক ও ঋণদাতার জন্য: অনেক ছোট ব্যবসার মধ্যে কার নগদ টাকা কম পড়তে পারে এবং কেন, তার আগাম সতর্কতা।", who: "রিলেশনশিপ ম্যানেজার ও ঋণ-ঝুঁকি দল",
      steps: ["লাল ও হলুদ সংখ্যা দিয়ে শুরু করুন।", "টেবিল ঝুঁকি অনুযায়ী সাজিয়ে প্রতিটি ক্লায়েন্টের মূল কারণ পড়ুন।",
        "অর্থনৈতিক ধাক্কা দিয়ে দেখুন কে বিপদে যাবে, তারপর ব্যাকটেস্ট কার্ড দেখুন।"],
      safe: "শুধু কৃত্রিম পোর্টফোলিওতে চলে। অন্য ওয়ার্কস্পেস পড়ে না; এর পরামর্শ ঋণের সিদ্ধান্ত নয়।"},
    security: {what: "নিরাপত্তার নিয়ন্ত্রণ: কে কী করতে পারেন, খরচের সীমা, AI-এর জরুরি বন্ধ বোতাম, প্রাপক যাচাই আর এক ক্লিকে আক্রমণ পরীক্ষা।", who: "মালিক; পরীক্ষা যে কেউ চালাতে পারেন",
      steps: ["পরীক্ষা চালিয়ে দেখুন প্রতিটি নকল আক্রমণ আটকে যাচ্ছে।",
        "জরুরি বন্ধ বোতাম সাথে সাথে AI থামায়; শুধু মালিক আবার চালু করতে পারেন।",
        "সন্দেহজনক প্রাপককে আগে থেকে থাকা নাম্বারে ফোন করে যাচাই করুন।"],
      safe: "এখানকার নিয়ন্ত্রণ টাকা রক্ষা করে; AI বা মেসেজের লেখা এগুলো বদলাতে পারে না।"},
    evidence: {what: "কী ঘটেছে তার প্রমাণ: বদল ধরা পড়ে এমন অডিট ট্রেইল, স্বাক্ষরিত অনুমোদন, রসিদ আর হিসাবরক্ষক বা ব্যাংকের জন্য এক্সপোর্ট।", who: "সবাই, অডিটর ও পর্যালোচক",
      steps: ["টেম্পার ড্রিল চালান: একটি রেকর্ড বদলান, দেখুন চেইন সেটি ধরে ফেলে।",
        "রসিদ খুলে খাতার আগের ও পরের ছাপ দেখুন।",
        "প্রমাণ, রেকর্ড বা ব্যাংক পেমেন্টের খসড়া ফাইল এক্সপোর্ট করুন।"],
      safe: "এক্সপোর্ট শুধু পড়ার কপি। ব্যাংকের খসড়া ফাইল কখনো পাঠানো হয় না।"},
    inbox: {what: "ব্যাংক বা বিকাশের এসএমএস বা চ্যাট মেসেজ পেস্ট করুন। টাইডওয়ে হিসাবের খসড়া বানাবে, কাউকে টাইপ করতে হবে না।", who: "মালিক ও হিসাবরক্ষক সংরক্ষণ করেন",
      steps: ["মেসেজ পেস্ট করে এক্সট্র্যাক্ট চাপুন।", "প্রতিটি ঘর মিলিয়ে দেখুন: অঙ্ক, তারিখ, ক্রেতা বা সরবরাহকারী।", "নিশ্চিত করলে সংরক্ষণ হবে। মেসেজের ভেতরের সন্দেহজনক নির্দেশ চিহ্নিত হয়।"],
      safe: "আপনি নিশ্চিত না করা পর্যন্ত কিছু সংরক্ষণ হয় না। মেসেজের লেখা কখনো ক্ষমতা পায় না।"},
    whatif: {what: "“যদি এমন হয়” প্রশ্ন করে দেখুন: ক্রেতা দেরিতে দিলে, হঠাৎ বিল এলে, বিক্রি কমলে নগদের কী হয়।", who: "সবাই",
      steps: ["স্লাইডার সরান বা অঙ্ক লিখুন।", "সর্বনিম্ন নগদ ও ঝুঁকি কীভাবে বদলায় দেখুন।", "এখানে যা চেষ্টা করবেন কিছুই সংরক্ষণ হয় না।"],
      safe: "শুধু দেখার জন্য। আপনার রেকর্ড বদলায় না।"},
  };

  const PAGES = {
    home: {
      what: "Your business at a glance: can you pay salaries, how low cash will go, who owes you money, and what to do next.",
      who: "Everyone",
      steps: ["Read the big coloured box first: green means fine, amber means watch out, red means act now.",
        "Press “Show me how to fix it” to get a plan you can approve, or ask a question in বাংলা or English.",
        "Got a strange bKash or bank SMS? Use “Check a suspicious SMS” before you hand over goods or money."],
      safe: "Read-only. Nothing on this page moves money.",
    },
    overview: {
      what: "Will the business have enough cash on the day it matters (for example payroll day)? This page answers that and shows how likely a shortfall is.",
      who: "Everyone",
      steps: ["Read the weather: clear means fine, unsettled means watch out, storm means cash is likely to run short.",
        "Find the lowest-cash day and compare it with your safety cushion (reserve floor).",
        "Thinking about a purchase? Use “test an expense” first. Switch to Detailed view for charts."],
      safe: "Read-only. Nothing on this page moves money.",
    },
    rescue: {
      what: "When a cash gap is coming, Tideway suggests ways to close it: pay a supplier later, offer a customer a small discount to pay sooner, or send reminders. People decide.",
      who: "Owners and accountants approve; viewers can read",
      steps: ["Ask the agent for options, then compare cost, remaining risk and who has to agree.",
        "Approve with your own PIN. Large amounts need a second person.",
        "Execution is a separate, final step and only happens in the practice sandbox."],
      safe: "The AI can propose but can never approve or execute. Every approval needs a person and a PIN.",
    },
    assistant: {
      what: "Ask questions in plain words, in your own language, and get answers built from Tideway's own calculations.",
      who: "Everyone",
      steps: ["Type “hi” for a quick briefing on today's cash position.",
        "Ask something like “What if Nila Traders pays 20 days late?”",
        "Open the plan under an answer to see exactly which tools were used."],
      safe: "The assistant can read and explain. It cannot move money or change records.",
    },
    learn: {
      what: "Six one-minute lessons on running a small business's money: safety money, salary day, late payers, relying on one customer, mobile money scams and getting a loan. Each is explained with your own numbers.",
      who: "Everyone",
      steps: ["Open a lesson and read the “Your numbers” box.", "Answer the quick question at the end; a correct answer marks the lesson done.", "Use the button under the lesson to go and act on it."],
      safe: "Learning only. No record changes and no money moves. Progress stays in this browser.",
    },
    inbox: {
      what: "Paste a bank SMS, payment alert or chat message. Tideway turns it into draft records so nobody has to type them in.",
      who: "Owners and accountants save; everyone can try",
      steps: ["Paste the message and press extract.",
        "Check every drafted field: amount, date, customer or supplier.",
        "Confirm to save. Suspicious instructions inside messages are flagged."],
      safe: "Nothing is saved until a person confirms. Text inside a message never gets authority.",
    },
    shield: {
      what: "Got a bKash, Nagad or Rocket SMS or a call that feels wrong? Paste it here. Scam Shield tells you whether it looks like fraud, why, and what to do, in English and বাংলা.",
      who: "Everyone",
      steps: ["Paste the message and, if you can, the sender shown on your phone.",
        "Read the verdict and every reason. A phone number sending a “you received money” SMS is a strong warning.",
        "Follow the steps: check your balance in the official app, never share a PIN or OTP, never return money because of an SMS."],
      safe: "Advice only. Nothing is saved, blocked or paid. No warning does not prove a message is genuine.",
    },
    whatif: {
      what: "Try “what if” questions: a customer pays late, an unexpected bill arrives, sales drop. See the effect on cash instantly.",
      who: "Everyone",
      steps: ["Move a slider or enter an amount.", "Watch the lowest cash and the shortfall risk change.", "Nothing you try here is saved."],
      safe: "Exploration only. Your records are not changed.",
    },
    lab: {
      what: "Stress-test a plan before you trust it: how late can a customer be before the plan breaks, and which recovery option is cheapest for the risk?",
      who: "Analysts, owners and accountants",
      steps: ["Find the breaking point for each customer.", "Compare recovery options side by side.",
        "Preview exactly what an optional cloud AI would see before you ever send anything."],
      safe: "Analysis only. Any change it suggests still needs the normal approvals.",
    },
    treasury: {
      what: "Bank-grade reports in one place: a 13-week cash plan, a working-capital health score, a scan for duplicate or unusual payments, and a signed credit passport you can share with a lender.",
      who: "Finance teams, owners, and lenders reviewing the business",
      steps: ["Read the week-by-week table and look for weeks below the reserve.",
        "Check the health score and the suggestions that would raise it most.",
        "Run the payment-integrity scan; issue and verify a credit passport."],
      safe: "Reports are read-only. Issuing a passport is recorded in the audit trail; no money moves.",
    },
    portfolio: {
      what: "For banks and lenders: an early-warning radar across many small-business clients, ranking who is likely to run short of cash and why.",
      who: "Relationship managers and credit-risk teams",
      steps: ["Start with the red and amber counts.", "Sort the table by risk and read each client's main driver.",
        "Apply an economic shock to see who would move into danger, then check the backtest card."],
      safe: "Runs on a synthetic portfolio only. It never reads other workspaces and its suggestions are advice, not credit decisions.",
    },
    records: {
      what: "The ledger behind every number: invoices you are owed, bills you owe, and past transactions.",
      who: "Everyone",
      steps: ["Filter by type or search for a customer or supplier.", "Red flags mark changed bank details or suspicious text.",
        "Export to a spreadsheet from the Evidence page."],
      safe: "Viewing records changes nothing. Suspicious text is quarantined and shown as plain data.",
    },
    team: {
      what: "Who can see and act for this business. Invite colleagues with a one-time code and the right role.",
      who: "Owners manage the team",
      steps: ["Owner: full control, including policy and resuming the agent.", "Accountant: can propose and approve plans.",
        "Viewer: read-only, cannot approve anything."],
      safe: "Every request is checked against membership, so businesses never see each other's data.",
    },
    security: {
      what: "The safety controls: who may do what, spending limits, an emergency stop for the AI, payee verification and a one-click attack self-test.",
      who: "Owners; everyone can run the self-test",
      steps: ["Run the self-test and watch every simulated attack get blocked.",
        "The kill switch pauses the AI instantly; only the owner can resume it.",
        "Verify a flagged payee by calling back a number already on file."],
      safe: "Controls here protect money; they cannot be changed by the AI or by message text.",
    },
    evidence: {
      what: "Proof of what happened: a tamper-evident audit trail, signed approvals, receipts and exports for your accountant or bank.",
      who: "Everyone, auditors and reviewers",
      steps: ["Run the tamper drill: change one record and watch the chain detect it.",
        "Open a receipt to see before and after fingerprints of the ledger.",
        "Export evidence, records or the draft bank payment file."],
      safe: "Exports are read-only copies. The draft bank file is never sent.",
    },
  };

  // ---- Jargon, explained once per page -------------------------------------
  const TERMS = [
    [["reserve floor", "reserve"], "Reserve floor", "The minimum cash you want to keep in the bank at all times: your safety cushion."],
    [["shortfall", "cash gap"], "Shortfall", "How much cash would be missing on a given day compared with what you need."],
    [["target date"], "Target date", "The day you care about, such as payroll day. Tideway also looks 14 days beyond it so problems can't hide just after."],
    [["Monte Carlo"], "Monte Carlo", "Replaying the coming weeks many times with realistic random payment delays to estimate the chance of running short."],
    [["breach risk", "breach probability", "breach"], "Breach", "Cash falling below your reserve floor. The risk is the share of simulated futures where that happens."],
    [["likely scenario", "likely path", "likely forecast"], "Likely scenario", "A forecast based on how each customer actually tends to pay, predicted by TidePay."],
    [["stress scenario", "stress path", "stress test"], "Stress scenario", "A cautious forecast in which slow payers are slower still."],
    [["mandate"], "Mandate", "A digitally signed permission slip listing exactly what people approved, for how much, and until when."],
    [["maker-checker"], "Maker-checker", "One person proposes and a different person approves: the standard bank control against mistakes and fraud."],
    [["deferral", "defer"], "Deferral", "Agreeing with a supplier to pay a bill later than planned."],
    [["early-payment discount", "early payment"], "Early-payment discount", "A small discount offered to a customer for paying sooner, bringing cash in earlier."],
    [["APR"], "APR", "The yearly cost of a discount or loan, so different options can be compared fairly."],
    [["kill switch"], "Kill switch", "An emergency stop that pauses the AI agent at once. Only the owner can resume it."],
    [["circuit breaker"], "Circuit breaker", "An automatic pause after repeated blocked attempts, like a fuse that trips."],
    [["audit trail", "audit log", "audit"], "Audit trail", "A permanent record of who did what and when. Each entry is chained to the previous one."],
    [["hash"], "Hash", "A digital fingerprint of data. If anything changes, even one digit, the fingerprint changes."],
    [["injection"], "Injection", "Hidden instructions inside a message that try to trick an AI. Tideway flags them and never obeys them."],
    [["TidePay"], "TidePay", "Tideway's own model that predicts how late each invoice is likely to be paid."],
    [["TideLM"], "TideLM", "Tideway's own language model that understands questions and pasted messages in several languages."],
    [["DSO"], "DSO", "Days Sales Outstanding: on average, how many days customers take to pay you."],
    [["DPO"], "DPO", "Days Payable Outstanding: on average, how many days you take to pay suppliers."],
    [["HHI", "concentration"], "Concentration", "How dependent you are on a few customers. High concentration means one late payer can hurt a lot."],
    [["13-week", "TWCF"], "13-week cash flow", "A week-by-week cash plan for the next quarter: the format banks and lenders ask for."],
    [["credit passport", "passport"], "Credit passport", "A signed summary of the business's cash health to share with a lender. Any edit breaks the signature."],
    [["HMAC"], "HMAC signature", "A secret-key signature that reveals tampering. Here only the issuing Tideway can verify it."],
    [["counter-offer", "counter offer"], "Counter-offer", "The other side proposes different terms. It becomes a new proposal that needs fresh approval."],
    [["step-up"], "Step-up", "Entering your PIN again for a sensitive action."],
    [["separation of duties"], "Separation of duties", "Whoever verified a payee cannot be the only person approving payments to them."],
    [["pseudonym", "pseudonymised", "pseudonymized"], "Pseudonym", "A stand-in name, so the real name is not shared with an outside service."],
    [["sandbox"], "Sandbox", "A safe practice environment with fictional businesses. No real money or bank is connected."],
    [["pain.001", "ISO 20022"], "ISO 20022 pain.001", "The international bank file format for payment instructions. Tideway only drafts it; it is never sent."],
    [["runway"], "Runway", "How many days your cash lasts at the current spending rate."],
    [["witness"], "Witness checkpoint", "A separate copy of the latest audit position that proves the log was not cut short."],
    [["exposure"], "Exposure", "The total amount of money affected by an approval."],
    [["read-back"], "Read-back", "After executing, Tideway reads the ledger again to confirm the change really happened."],
    [["quarantine", "quarantined"], "Quarantine", "Suspicious text is set aside and shown only as data, never treated as an instruction."],
    [["backtest"], "Backtest", "Checking a warning system against simulated outcomes it did not see when it made its call."],
    [["AUC"], "AUC", "How well a score ranks risky clients above safe ones: 0.5 is a coin flip, 1.0 is perfect."],
    [["Brier"], "Brier score", "The accuracy of probability forecasts. Lower is better."],
  ];
  const lookup = new Map();
  for (const [aliases, title, text] of TERMS) for (const alias of aliases) lookup.set(alias.toLowerCase(), {title, text, key: title});
  const pattern = new RegExp(`(?<![\\w-])(${[...lookup.keys()].sort((a, b) => b.length - a.length)
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})(?![\\w-])`, "i");
  const SKIP = "input,textarea,select,option,button,a,pre,code,script,style,svg,dialog,.tw-term,.tw-page-help,.msg.user,[data-currency-original],.nav-item,.pill,th";

  const enabled = () => store.get("tideway.help.v1", "on") !== "off";
  const currentView = () => { try { return typeof state !== "undefined" ? state.view : ""; } catch { return ""; } };
  const currentRole = () => { try { return typeof role === "function" ? role() : ""; } catch { return ""; } };

  function decorate(root) {
    // English glossary terms only: in বাংলা, splitting a text node would stop the translator matching the sentence.
    if (!enabled() || !root || (typeof state !== "undefined" && state.lang === "bn")) return;
    const seen = new Set();
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => !node.nodeValue.trim() || node.parentElement?.closest(SKIP) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
    });
    const nodes = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) nodes.push(node);
    for (const node of nodes) {
      const match = pattern.exec(node.nodeValue);
      if (!match) continue;
      const entry = lookup.get(match[1].toLowerCase());
      if (!entry || seen.has(entry.key)) continue;
      seen.add(entry.key);
      const after = node.splitText(match.index);
      after.nodeValue = after.nodeValue.slice(match[1].length);
      const term = document.createElement("span");
      term.className = "tw-term";
      term.tabIndex = 0;
      term.setAttribute("role", "button");
      term.dataset.term = entry.key;
      term.setAttribute("aria-label", `${match[1]}: explain`);
      term.textContent = match[1];
      node.parentNode.insertBefore(term, after);
    }
  }

  // ---- Page explainer card -------------------------------------------------
  function pageCard() {
    const view = currentView();
    let host = document.getElementById("tw-page-help");
    const anchor = document.querySelector(".page-guidance");
    if (!anchor) return;
    if (!host) {
      host = document.createElement("section");
      host.id = "tw-page-help";
      host.className = "tw-page-help";
      host.setAttribute("aria-label", "About this page");
      anchor.append(host);
    }
    const page = PAGES[view];
    if (!enabled() || !page) { host.hidden = true; host.dataset.view = ""; return; }
    const folded = store.get(`tideway.help.fold.${view}`, "folded") === "folded";
    const key = `${view}|${folded}|${currentRole()}|${state.lang}`;
    if (host.dataset.key === key && !host.hidden) return;
    host.dataset.key = key;
    host.hidden = false;
    const r = currentRole();
    const bn = typeof state !== "undefined" && state.lang === "bn";
    const p = bn && PAGES_BN[view] ? {...page, ...PAGES_BN[view]} : page;
    const L = bn ? {for: "কার জন্য", as: "আপনি সাইন ইন করেছেন"}
      : {for: "For", as: "You are signed in as"};
    host.lang = bn ? "bn" : "en";
    host.innerHTML = `<button type="button" class="guidance-toggle" data-help-fold="${escape(view)}" aria-controls="page-help-body" aria-expanded="${!folded}">${bn ? "এই পাতার সাহায্য" : "Page help"}</button>
      <div id="page-help-body" class="guidance-body" ${folded ? "hidden" : ""}><p>${escape(p.what)}</p><ol>${p.steps.map((s) => `<li>${escape(s)}</li>`).join("")}</ol>
      <div class="tw-help-meta"><span class="tw-chip">${L.for}: ${escape(p.who)}</span>${r ? `<span class="tw-chip">${L.as}: ${escape(r)}</span>` : ""}<span class="tw-chip tw-safe">${escape(p.safe)}</span></div></div>`;
  }

  // ---- Glossary popover ----------------------------------------------------
  let pop = null, popFor = null;
  function showTerm(el) {
    const entry = [...lookup.values()].find((e) => e.key === el.dataset.term);
    if (!entry) return;
    if (!pop) {
      pop = document.createElement("div");
      pop.id = "tw-pop";
      pop.className = "tw-pop";
      pop.setAttribute("role", "tooltip");
      document.body.appendChild(pop);
    }
    pop.innerHTML = `<strong>${escape(entry.title)}</strong><span>${escape(entry.text)}</span>`;
    pop.hidden = false;
    popFor = el;
    el.setAttribute("aria-describedby", "tw-pop");
    const box = el.getBoundingClientRect(), width = Math.min(300, window.innerWidth - 24);
    pop.style.width = `${width}px`;
    const left = Math.max(12, Math.min(window.innerWidth - width - 12, box.left + box.width / 2 - width / 2));
    pop.style.left = `${left + window.scrollX}px`;
    const below = box.bottom + 8 + pop.offsetHeight < window.innerHeight;
    pop.style.top = `${(below ? box.bottom + 8 : box.top - 8 - pop.offsetHeight) + window.scrollY}px`;
  }
  function hideTerm() {
    if (pop) pop.hidden = true;
    popFor?.removeAttribute("aria-describedby");
    popFor = null;
  }

  // ---- Guided tour of the navigation --------------------------------------
  const TOUR = [
    ["home", "Home", "Start here: can you pay salaries, how low will cash go, and what should you do next?"],
    ["overview", "Cash forecast", "Will cash last until the day that matters? Day by day, with the odds of running short."],
    ["rescue", "Fix a cash gap", "If a gap is coming, Tideway proposes fixes. People approve with a PIN."],
    ["assistant", "Ask Tideway", "Ask anything in plain words, in বাংলা or English."],
    ["shield", "Scam check", "Paste a suspicious bKash, Nagad or Rocket SMS before you act on it."],
    ["inbox", "Add from SMS", "Paste payment alerts and messages; Tideway drafts the records for you."],
    ["learn", "Money lessons", "Six one-minute lessons with your own numbers: safety money, salary day, late payers, scams and loans."],
    ["whatif", "What if…?", "Try scenarios safely. Nothing is saved."],
    ["records", "Records", "Every invoice, bill and transaction behind the numbers."],
    ["team", "Team", "Invite colleagues with the right role."],
    ["lab", "Decision lab", "Stress-test a plan before trusting it."],
    ["treasury", "Bank reports", "13-week cash plan, health score, duplicate-payment scan and a signed credit passport."],
    ["portfolio", "Lender radar", "For lenders: early warning across many small-business clients."],
    ["security", "Safety settings", "Emergency stop, limits, payee checks and an attack self-test."],
    ["evidence", "Audit trail", "Tamper-evident proof of everything that happened."],
  ];
  let tourIndex = -1, tourSteps = [];
  function tourShow() {
    document.querySelectorAll(".tw-tour-target").forEach((el) => el.classList.remove("tw-tour-target"));
    let card = document.getElementById("tw-tour");
    if (tourIndex < 0 || tourIndex >= tourSteps.length) { card?.remove(); tourIndex = -1; return; }
    const [view, title, text] = tourSteps[tourIndex];
    const target = [...document.querySelectorAll(`.nav-item[data-view="${view}"], .tab-item[data-view="${view}"], .tool-link[data-view="${view}"]`)]
      .find((item) => item.getClientRects().length);
    target?.classList.add("tw-tour-target");
    target?.scrollIntoView({block: "nearest"});
    if (!card) {
      card = document.createElement("div");
      card.id = "tw-tour";
      card.className = "tw-tour";
      card.setAttribute("role", "dialog");
      card.setAttribute("aria-label", "Guided tour");
      document.body.appendChild(card);
    }
    card.innerHTML = `<span class="eyebrow">Tour · ${tourIndex + 1} of ${tourSteps.length}</span><h3>${escape(title)}</h3><p>${escape(text)}</p>
      <div class="tw-tour-actions"><button type="button" class="button small ghost" data-tour="end">Close</button>
      <span>${tourIndex > 0 ? '<button type="button" class="button small ghost" data-tour="back">Back</button>' : ""}
      <button type="button" class="button small ghost" data-view="${escape(view)}" data-tour="open">Open page</button>
      <button type="button" class="button small primary" data-tour="next">${tourIndex === tourSteps.length - 1 ? "Finish" : "Next"}</button></span></div>`;
    const box = target?.getBoundingClientRect();
    card.style.top = `${Math.max(12, Math.min(window.innerHeight - 220, box ? box.top - 10 : 80))}px`;
    card.style.left = `${Math.max(12, Math.min(window.innerWidth - card.offsetWidth - 12, box ? box.right + 14 : 24))}px`;
    card.querySelector('[data-tour="next"]')?.focus({preventScroll: true});
  }
  function startTour() {
    tourSteps = TOUR.filter(([view]) => viewAvailable(view));
    tourIndex = 0;
    tourShow();
  }

  // ---- Toolbar controls ----------------------------------------------------
  function toolbar() {
    const controls = document.getElementById("workspace-help");
    if (!controls || document.getElementById("tw-help-tools")) return;
    const tools = document.createElement("div");
    tools.id = "tw-help-tools";
    tools.className = "tw-help-tools";
    tools.innerHTML = `<button type="button" class="button ghost small" data-help-tool="tour" title="A one-minute tour of every page">Guided tour</button>
      <button type="button" class="button ghost small" data-help-tool="toggle" aria-pressed="${enabled()}" title="Show plain-language help on every page">Help ${enabled() ? "on" : "off"}</button>
      <button type="button" class="button ghost small" data-help-tool="text" aria-pressed="${document.documentElement.classList.contains("tw-large")}">Larger text</button>`;
    controls.prepend(tools);
  }
  function syncToolbar() {
    const toggle = document.querySelector('[data-help-tool="toggle"]');
    if (toggle) { toggle.textContent = `Help ${enabled() ? "on" : "off"}`; toggle.setAttribute("aria-pressed", String(enabled())); }
    const text = document.querySelector('[data-help-tool="text"]');
    text?.setAttribute("aria-pressed", String(document.documentElement.classList.contains("tw-large")));
  }

  function refresh() {
    try {
      observer.disconnect();
      toolbar();
      pageCard();
      decorate(document.getElementById("view"));
      decorate(document.getElementById("quick-start"));
    } catch (error) {
      console.warn("Tideway help layer skipped:", error);
    } finally {
      const view = document.getElementById("view");
      if (view) observer.observe(view, {childList: true, subtree: true});
    }
  }
  let queued = false;
  const observer = new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; refresh(); });
  });

  document.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    const term = target.closest(".tw-term");
    if (term) { popFor === term ? hideTerm() : showTerm(term); return; }
    if (!target.closest(".tw-pop")) hideTerm();
    const fold = target.closest("[data-help-fold]");
    if (fold) {
      const key = `tideway.help.fold.${fold.dataset.helpFold}`;
      store.set(key, store.get(key, "folded") === "folded" ? "open" : "folded");
      pageCard();
      document.querySelector("[data-help-fold]")?.focus({preventScroll: true});
      return;
    }
    const tool = target.closest("[data-help-tool]");
    if (tool) {
      if (tool.dataset.helpTool === "tour") {
        document.getElementById("workspace-options").open = false;
        startTour();
      }
      if (tool.dataset.helpTool === "toggle") {
        store.set("tideway.help.v1", enabled() ? "off" : "on");
        if (!enabled()) document.querySelectorAll(".tw-term").forEach((el) => el.replaceWith(document.createTextNode(el.textContent)));
        pageCard(); refresh(); syncToolbar();
      }
      if (tool.dataset.helpTool === "text") {
        document.documentElement.classList.toggle("tw-large");
        store.set("tideway.help.large", document.documentElement.classList.contains("tw-large") ? "on" : "off");
        syncToolbar();
      }
      return;
    }
    const tour = target.closest("[data-tour]");
    if (tour) {
      const step = tour.dataset.tour;
      if (step === "next") tourIndex = tourIndex === tourSteps.length - 1 ? -1 : tourIndex + 1;
      else if (step === "back") tourIndex = Math.max(0, tourIndex - 1);
      else if (step === "end") tourIndex = -1;
      if (step !== "open") tourShow();
    }
  });
  document.addEventListener("mouseover", (event) => {
    const term = event.target instanceof Element ? event.target.closest(".tw-term") : null;
    if (term && term !== popFor) showTerm(term);
  });
  document.addEventListener("mouseout", (event) => {
    const term = event.target instanceof Element ? event.target.closest(".tw-term") : null;
    const next = event.relatedTarget instanceof Element ? event.relatedTarget.closest(".tw-term") : null;
    if (term && term === popFor && next !== term && document.activeElement !== term) hideTerm();
  });
  document.addEventListener("focusin", (event) => {
    const term = event.target instanceof Element ? event.target.closest(".tw-term") : null;
    if (term) showTerm(term);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") { hideTerm(); if (tourIndex >= 0) { tourIndex = -1; tourShow(); } }
    const term = event.target instanceof Element ? event.target.closest(".tw-term") : null;
    if (term && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); popFor === term ? hideTerm() : showTerm(term); }
  });
  window.addEventListener("scroll", hideTerm, {passive: true});

  if (store.get("tideway.help.large", "off") === "on") document.documentElement.classList.add("tw-large");
  document.addEventListener("DOMContentLoaded", refresh);
  return Object.freeze({refresh, startTour, pages: Object.keys(PAGES), terms: TERMS.length});
})();
