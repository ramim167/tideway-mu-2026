"use strict";

// Money lessons (টাকার পাঠ): six short lessons on running a small business's money, each explained with the
// owner's OWN numbers from the dashboard the server already computed, and each ending with a one-question check.
// Financial literacy for owners who never had a finance class. Read-only: it changes no record and moves no money.
// Progress is kept in this browser only (localStorage).
window.TidewayLearn = (() => {
  const KEY = "tideway:lessons";
  const BN_MONTHS = "জানু ফেব্রু মার্চ এপ্রি মে জুন জুলাই আগ সেপ্টে অক্টো নভে ডিসে".split(" ");
  let openId = "safety";
  const answers = {};

  const lang = () => (state.lang === "bn" ? "bn" : "en");
  const fill = (text, values) => String(text).replace(/\{(\w+)\}/g, (_, key) => values[key] ?? "—");
  const cash = (minor) => (isNum(minor) ? money(minor) : "—");
  const num = (value) => (lang() === "bn" ? bnDigits(value) : String(value));
  const pct = (share) => (isNum(share) ? `${num(Math.round(share * 100))}%` : "—");
  const date = (value) => {
    if (!value) return "—";
    if (lang() === "en") return day(value);
    const d = new Date(`${String(value).slice(0, 10)}T12:00:00Z`);
    return `${d.getUTCDate()} ${BN_MONTHS[d.getUTCMonth()]}`;
  };
  function done() {
    try { return new Set(JSON.parse(localStorage.getItem(KEY) || "[]")); } catch (_) { return new Set(); }
  }
  function save(set) {
    try { localStorage.setItem(KEY, JSON.stringify([...set])); } catch (_) { /* optional progress */ }
  }

  // Only figures the server already computed; nothing is forecast here.
  function facts(d) {
    const ov = d?.owner_view || {}, k = d?.kpis || {};
    const monthly = k.monthly_expense_run_rate_minor;
    const safety = ov.reserve_floor_minor;
    const owed = (ov.customer_receipts || []).filter((row) => row.open_amount_minor > 0)
      .sort((a, b) => b.open_amount_minor - a.open_amount_minor);
    return {
      safety: cash(safety), monthly: cash(monthly),
      safetyDays: isNum(safety) && isNum(monthly) && monthly > 0 ? num(Math.round(safety / (monthly / 30))) : null,
      payroll: cash(ov.payroll?.next_amount_minor), payday: date(ov.payroll?.next_date), hasPayroll: Boolean(ov.payroll?.identified),
      low: cash(ov.likely?.minimum_cash_minor), lowDate: date(ov.likely?.minimum_cash_date),
      payrollShort: Boolean(ov.likely?.payroll_unfunded),
      dso: isNum(k.dso_days) ? num(Math.round(k.dso_days)) : null, terms: isNum(k.average_terms_days) ? num(Math.round(k.average_terms_days)) : null,
      onTime: pct(k.on_time_share), top: pct(k.top_customer_share), topShare: k.top_customer_share,
      topName: owed[0]?.customer || "—", owed: cash(k.open_receivables_minor),
      settled: num(k.settled_invoices ?? 0), warnings: (d?.warnings || []).length, warningsText: num((d?.warnings || []).length),
    };
  }

  const LESSONS = [
    {id: "safety", icon: "lock", go: "overview",
      en: {title: "Safety money: your cushion", why: "Every business has bad weeks: a customer pays late, a machine breaks. Safety money is cash you never plan to spend, so a bad week does not stop salaries or supplies.",
        yours: (f) => f.safetyDays !== null ? `Your safety money is ${f.safety}. You spend about ${f.monthly} a month, so it covers about ${f.safetyDays} days of costs.` : `Your safety money is ${f.safety}.`,
        tip: "Aim for 2 to 4 weeks of costs. Add a little every good week rather than all at once.",
        q: "Your costs are 90,000 a month. About how much is 2 weeks of safety money?", options: ["10,000", "45,000", "90,000"], answer: 1,
        explain: "2 weeks is about half a month: 90,000 ÷ 2 = 45,000.", goLabel: "See your cash forecast"},
      bn: {title: "নিরাপত্তার টাকা: আপনার সুরক্ষা", why: "প্রতিটি ব্যবসায় খারাপ সপ্তাহ আসে: ক্রেতা দেরিতে টাকা দেন, যন্ত্র নষ্ট হয়। নিরাপত্তার টাকা এমন নগদ যা আপনি খরচের পরিকল্পনায় রাখেন না, তাই খারাপ সপ্তাহেও বেতন বা মাল কেনা থামে না।",
        yours: (f) => f.safetyDays !== null ? `আপনার নিরাপত্তার টাকা ${f.safety}। মাসে খরচ প্রায় ${f.monthly}, তাই এটি প্রায় ${f.safetyDays} দিনের খরচ চালাতে পারে।` : `আপনার নিরাপত্তার টাকা ${f.safety}।`,
        tip: "২ থেকে ৪ সপ্তাহের খরচের সমান রাখার চেষ্টা করুন। একবারে নয়, প্রতিটি ভালো সপ্তাহে একটু করে যোগ করুন।",
        q: "মাসে খরচ ৯০,০০০ টাকা। ২ সপ্তাহের নিরাপত্তার টাকা প্রায় কত?", options: ["১০,০০০", "৪৫,০০০", "৯০,০০০"], answer: 1,
        explain: "২ সপ্তাহ মানে প্রায় আধা মাস: ৯০,০০০ ÷ ২ = ৪৫,০০০।", goLabel: "নগদের পূর্বাভাস দেখুন"}},
    {id: "payday", icon: "user", go: "home",
      en: {title: "Salary day comes first", why: "Staff trust you because salaries arrive on time. The danger is not your total income, it is the day cash is lowest. If that day is before customers pay, salaries can fall short even in a good month.",
        yours: (f) => f.hasPayroll ? `Next salaries: ${f.payroll} on ${f.payday}. Your cash is expected to be lowest (${f.low}) on ${f.lowDate}.${f.payrollShort ? " Right now salary money will run short, so act before payday." : ""}` : "No salary payment is recorded yet. Add the date and amount so Tideway can check payday for you.",
        tip: "Know your lowest-cash day. Ask customers to pay before salary day, and move non-urgent bills to after it.",
        q: "Salaries are due on the 31st, but your biggest customer pays on the 5th. What helps most?", options: ["Buy new stock now", "Ask the customer to pay before the 31st, or a supplier to wait", "Do nothing, the month total is fine"], answer: 1,
        explain: "The timing is the problem, not the total. Bringing money in earlier or paying a bill later fixes the gap.", goLabel: "Open Home"},
      bn: {title: "বেতনের দিন সবার আগে", why: "সময়মতো বেতন পান বলেই কর্মীরা আপনার ওপর ভরসা করেন। বিপদ মোট আয়ে নয়, বিপদ সেই দিনে যেদিন নগদ সবচেয়ে কম। ক্রেতারা টাকা দেওয়ার আগেই যদি সেই দিন আসে, ভালো মাসেও বেতনের টাকা কম পড়তে পারে।",
        yours: (f) => f.hasPayroll ? `পরের বেতন: ${f.payday} তারিখে ${f.payroll}। নগদ সবচেয়ে কম হবে ${f.lowDate} তারিখে (${f.low})।${f.payrollShort ? " এখন বেতনের টাকা কম পড়বে, তাই বেতনের দিনের আগেই ব্যবস্থা নিন।" : ""}` : "এখনো কোনো বেতনের রেকর্ড নেই। তারিখ ও পরিমাণ যোগ করুন, তাহলে টাইডওয়ে বেতনের দিন যাচাই করবে।",
        tip: "কোন দিন নগদ সবচেয়ে কম তা জেনে রাখুন। ক্রেতাদের বেতনের দিনের আগে টাকা দিতে বলুন, জরুরি নয় এমন বিল পরে দিন।",
        q: "বেতন ৩১ তারিখে, কিন্তু সবচেয়ে বড় ক্রেতা টাকা দেন ৫ তারিখে। কোনটি সবচেয়ে বেশি কাজে দেবে?", options: ["এখনই নতুন মাল কিনুন", "ক্রেতাকে ৩১ তারিখের আগে টাকা দিতে বলুন, বা সরবরাহকারীকে অপেক্ষা করতে বলুন", "কিছু করবেন না, মাসের মোট হিসাব তো ঠিক আছে"], answer: 1,
        explain: "সমস্যা সময়ের, মোট টাকার নয়। টাকা আগে আনা বা বিল পরে দেওয়াই ঘাটতি মেটায়।", goLabel: "হোম খুলুন"}},
    {id: "late", icon: "inbox", go: "rescue",
      en: {title: "Customers who pay late", why: "Selling on credit (baki) wins customers, but every late day is your money sitting in someone else's pocket. Late payers are the most common reason small businesses run out of cash.",
        yours: (f) => f.dso !== null ? `Your customers take about ${f.dso} days to pay${f.terms !== null ? ` (you give ${f.terms} days)` : ""}. Only ${f.onTime} of payments arrived on time. Customers owe you ${f.owed} now.` : `Customers owe you ${f.owed} now.`,
        tip: "Send a polite reminder a few days before the due date. A small discount for paying early often costs less than borrowing.",
        q: "When is the best time to send a payment reminder?", options: ["A few days before the due date", "Only after a month late", "Never, it may upset them"], answer: 0,
        explain: "A friendly early reminder is normal business, and it catches problems while there is still time.", goLabel: "See reminders in Fix a cash gap"},
      bn: {title: "যে ক্রেতারা দেরিতে টাকা দেন", why: "বাকিতে বিক্রি ক্রেতা ধরে রাখে, কিন্তু প্রতিটি দেরির দিন মানে আপনার টাকা অন্যের পকেটে। দেরিতে টাকা পাওয়াই ছোট ব্যবসার নগদ ফুরিয়ে যাওয়ার সবচেয়ে সাধারণ কারণ।",
        yours: (f) => f.dso !== null ? `আপনার ক্রেতারা টাকা দিতে গড়ে প্রায় ${f.dso} দিন নেন${f.terms !== null ? ` (আপনি সময় দেন ${f.terms} দিন)` : ""}। মাত্র ${f.onTime} টাকা সময়মতো এসেছে। এখন ক্রেতাদের কাছে আপনার পাওনা ${f.owed}।` : `এখন ক্রেতাদের কাছে আপনার পাওনা ${f.owed}।`,
        tip: "টাকা দেওয়ার তারিখের কয়েক দিন আগে ভদ্রভাবে মনে করিয়ে দিন। আগে টাকা দিলে ছোট ছাড় দেওয়া প্রায়ই ঋণ নেওয়ার চেয়ে সস্তা।",
        q: "টাকা চাওয়ার রিমাইন্ডার পাঠানোর সবচেয়ে ভালো সময় কখন?", options: ["টাকা দেওয়ার তারিখের কয়েক দিন আগে", "এক মাস দেরি হওয়ার পরেই শুধু", "কখনো না, তাঁরা রাগ করতে পারেন"], answer: 0,
        explain: "আগে থেকে ভদ্রভাবে মনে করানো স্বাভাবিক ব্যবসায়িক রীতি, আর এতে সময় থাকতেই সমস্যা ধরা পড়ে।", goLabel: "টাকার ঘাটতি মেটান পাতায় রিমাইন্ডার দেখুন"}},
    {id: "concentration", icon: "radar", go: "assistant",
      en: {title: "Too much on one customer", why: "If one customer brings most of your money, their bad month becomes your bad month. Spreading sales across more customers makes your cash steadier.",
        yours: (f) => isNum(f.topShare) ? `${f.topName} accounts for ${f.top} of the money customers owe you.${f.topShare >= 0.5 ? " That is a lot on one customer." : ""}` : "Tideway will show your biggest customer's share once customers owe you money.",
        tip: "Before giving more credit to your biggest customer, check how late they usually pay, and keep looking for a few new regular customers.",
        q: "One customer owes you 75% of all your unpaid money. What is the main risk?", options: ["None, big customers always pay", "If they pay late, most of your incoming cash is late", "You pay more tax"], answer: 1,
        explain: "When most money comes from one place, one delay hits almost all of your incoming cash.", goLabel: "Ask Tideway about your customers"},
      bn: {title: "এক ক্রেতার ওপর বেশি নির্ভরতা", why: "আপনার বেশির ভাগ টাকা যদি একজন ক্রেতার কাছ থেকে আসে, তাঁর খারাপ মাস আপনারও খারাপ মাস। বেশি ক্রেতার কাছে বিক্রি করলে নগদ বেশি স্থির থাকে।",
        yours: (f) => isNum(f.topShare) ? `ক্রেতাদের কাছে আপনার পাওনার ${f.top} ${f.topName}-এর কাছে।${f.topShare >= 0.5 ? " একজন ক্রেতার ওপর এটি অনেক বেশি নির্ভরতা।" : ""}` : "ক্রেতাদের কাছে পাওনা থাকলে টাইডওয়ে সবচেয়ে বড় ক্রেতার ভাগ দেখাবে।",
        tip: "সবচেয়ে বড় ক্রেতাকে আরও বাকি দেওয়ার আগে দেখুন তিনি সাধারণত কত দেরিতে দেন, আর কয়েকজন নতুন নিয়মিত ক্রেতা খুঁজতে থাকুন।",
        q: "একজন ক্রেতার কাছে আপনার মোট পাওনার ৭৫%। প্রধান ঝুঁকি কী?", options: ["কোনো ঝুঁকি নেই, বড় ক্রেতারা সবসময় টাকা দেন", "তিনি দেরি করলে আপনার আসার কথা টাকার বেশির ভাগই দেরিতে আসবে", "আপনাকে বেশি কর দিতে হবে"], answer: 1,
        explain: "বেশির ভাগ টাকা এক জায়গা থেকে এলে একটি দেরিতেই প্রায় সব আসার কথা টাকা আটকে যায়।", goLabel: "ক্রেতাদের নিয়ে প্রশ্ন করুন"}},
    {id: "scams", icon: "shield", go: "shield",
      en: {title: "Mobile money scams", why: "Scammers target busy shop owners on bKash, Nagad and Rocket: a fake “you received money” SMS, a call saying money was “sent by mistake”, or someone asking for your PIN or OTP.",
        yours: (f) => f.warnings ? `Tideway found ${f.warnings} warning(s) in your records. Check them in Safety settings before paying anyone.` : "Tideway found no fraud warnings in your records right now.",
        tip: "Never share your PIN or OTP with anyone, not even “head office”. Check your balance in the official app before sending money back.",
        q: "You get an SMS from a phone number: “You received Tk 5,000”, then a call asking you to send it back. What do you do?", options: ["Send it back quickly to be polite", "Check your balance in the official app first; the real company never sends from a personal number", "Share your PIN so they can fix it"], answer: 1,
        explain: "Real payment SMS come from the company's name, not a phone number. Your balance in the app is the truth.", goLabel: "Check a message in Scam check"},
      bn: {title: "মোবাইল ব্যাংকিং প্রতারণা", why: "প্রতারকেরা বিকাশ, নগদ ও রকেটে ব্যস্ত দোকানদারদের লক্ষ্য করে: ভুয়া “টাকা পেয়েছেন” এসএমএস, “ভুল করে টাকা চলে গেছে” বলে ফোন, বা পিন ও ওটিপি চাওয়া।",
        yours: (f) => f.warnings ? `টাইডওয়ে আপনার হিসাবে ${f.warningsText}টি সতর্কতা পেয়েছে। কাউকে টাকা দেওয়ার আগে নিরাপত্তা পাতায় দেখে নিন।` : "এই মুহূর্তে আপনার হিসাবে টাইডওয়ে কোনো প্রতারণার সতর্কতা পায়নি।",
        tip: "কাউকে পিন বা ওটিপি বলবেন না, “হেড অফিস” বললেও না। টাকা ফেরত পাঠানোর আগে অফিসিয়াল অ্যাপে ব্যালেন্স দেখুন।",
        q: "একটি ফোন নাম্বার থেকে এসএমএস এল: “আপনি ৫,০০০ টাকা পেয়েছেন”, তারপর ফোনে টাকা ফেরত চাইল। কী করবেন?", options: ["ভদ্রতা করে দ্রুত টাকা ফেরত দিন", "আগে অফিসিয়াল অ্যাপে ব্যালেন্স দেখুন; আসল কোম্পানি ব্যক্তিগত নাম্বার থেকে এসএমএস পাঠায় না", "ঠিক করার জন্য পিন বলে দিন"], answer: 1,
        explain: "আসল লেনদেনের এসএমএস আসে কোম্পানির নামে, ফোন নাম্বার থেকে নয়। অ্যাপের ব্যালেন্সই আসল সত্য।", goLabel: "প্রতারণা যাচাই পাতায় মেসেজ যাচাই করুন"}},
    {id: "loan", icon: "bank", go: "treasury",
      en: {title: "Getting a loan on fair terms", why: "Banks and microfinance lenders lend more cheaply to businesses that can show steady sales and bills paid on time. Clean records are your proof, and they can save you from high-interest informal loans.",
        yours: (f) => `You have ${f.settled} paid invoice(s) on record. Each one is history a lender can see. Bank reports can turn your records into a signed credit passport to show a lender.`,
        tip: "Keep business and personal money separate, record every sale and bill, and pay suppliers on time. Compare the total cost of a loan, not only the monthly instalment.",
        q: "What helps most when you ask a bank or MFI for a loan?", options: ["Months of clear records of sales and on-time payments", "A big shop sign", "Mixing family and business money in one account"], answer: 0,
        explain: "Lenders trust what they can check. Steady, recorded sales and on-time payments show you can repay.", goLabel: "Open Bank reports"},
      bn: {title: "ন্যায্য শর্তে ঋণ পাওয়া", why: "যে ব্যবসা নিয়মিত বিক্রি আর সময়মতো বিল পরিশোধ দেখাতে পারে, ব্যাংক ও ক্ষুদ্রঋণ প্রতিষ্ঠান তাদের কম খরচে ঋণ দেয়। পরিষ্কার হিসাবই আপনার প্রমাণ, আর এটি চড়া সুদের অনানুষ্ঠানিক ঋণ থেকে বাঁচাতে পারে।",
        yours: (f) => `আপনার হিসাবে ${f.settled}টি পরিশোধিত চালান আছে। প্রতিটিই ঋণদাতার দেখার মতো ইতিহাস। ব্যাংকের রিপোর্ট পাতা আপনার হিসাব থেকে স্বাক্ষরিত ক্রেডিট পাসপোর্ট বানাতে পারে, যা ঋণদাতাকে দেখানো যায়।`,
        tip: "ব্যবসা ও পরিবারের টাকা আলাদা রাখুন, প্রতিটি বিক্রি ও বিল লিখে রাখুন, সরবরাহকারীকে সময়মতো দিন। শুধু মাসিক কিস্তি নয়, ঋণের মোট খরচ তুলনা করুন।",
        q: "ব্যাংক বা এমএফআই-এর কাছে ঋণ চাইলে কোনটি সবচেয়ে বেশি কাজে দেয়?", options: ["কয়েক মাসের বিক্রি ও সময়মতো পরিশোধের পরিষ্কার হিসাব", "দোকানের বড় সাইনবোর্ড", "পরিবার ও ব্যবসার টাকা এক অ্যাকাউন্টে রাখা"], answer: 0,
        explain: "ঋণদাতা তাই বিশ্বাস করেন যা যাচাই করা যায়। নিয়মিত লেখা বিক্রি ও সময়মতো পরিশোধ দেখায় আপনি ঋণ শোধ করতে পারবেন।", goLabel: "ব্যাংকের রিপোর্ট খুলুন"}},
  ];

  const UI = {
    en: {intro: "Six short lessons on running your business's money, explained with your own numbers. Each takes about a minute and ends with one question.",
      progress: "{n} of {total} lessons done", why: "Why it matters", yours: "Your numbers", tip: "Try this", check: "Quick check",
      right: "Correct!", wrong: "Not quite.", again: "Try again", next: "Next lesson", done: "Done", start: "Open lesson", reset: "Start over",
      allDone: "All lessons done. Well done! Your numbers change every week, so come back and read them again.",
      note: "Lessons are general guidance for small businesses, not personal financial advice. Your progress is saved only in this browser."},
    bn: {intro: "ব্যবসার টাকা সামলানোর ছয়টি ছোট পাঠ, আপনার নিজের হিসাব দিয়ে বোঝানো। প্রতিটি প্রায় এক মিনিটের, শেষে একটি প্রশ্ন।",
      progress: "{total}টির মধ্যে {n}টি পাঠ শেষ", why: "কেন জরুরি", yours: "আপনার হিসাব", tip: "যা করবেন", check: "ছোট্ট যাচাই",
      right: "ঠিক উত্তর!", wrong: "পুরোপুরি ঠিক নয়।", again: "আবার চেষ্টা করুন", next: "পরের পাঠ", done: "শেষ", start: "পাঠ খুলুন", reset: "আবার শুরু করুন",
      allDone: "সব পাঠ শেষ। অভিনন্দন! আপনার হিসাব প্রতি সপ্তাহে বদলায়, তাই মাঝে মাঝে আবার পড়ে দেখুন।",
      note: "পাঠগুলো ছোট ব্যবসার জন্য সাধারণ পরামর্শ, ব্যক্তিগত আর্থিক পরামর্শ নয়। আপনার অগ্রগতি শুধু এই ব্রাউজারে সংরক্ষিত থাকে।"},
  };

  function meter(n, total) {
    const value = total ? Math.round((n / total) * 100) : 0;
    // SVG attributes, not inline styles: the Content Security Policy blocks style attributes.
    return `<svg class="learn-meter" viewBox="0 0 100 8" preserveAspectRatio="none" role="img" aria-label="${value}%">
      <rect class="learn-meter-track" width="100" height="8" rx="4"></rect><rect class="learn-meter-fill" width="${value}" height="8" rx="4"></rect></svg>`;
  }

  function lessonHtml(lesson, index, f, finished, w) {
    const t = lesson[lang()], isOpen = openId === lesson.id, isDone = finished.has(lesson.id);
    const head = `<button type="button" class="learn-head" data-action="learn-open" data-id="${lesson.id}" aria-expanded="${isOpen}">
      <span class="learn-num ${isDone ? "done" : ""}" aria-hidden="true">${isDone ? icon("check") : num(index + 1)}</span>
      <span class="learn-title"><strong>${esc(t.title)}</strong>${isDone ? `<span class="pill clear">${esc(w.done)}</span>` : ""}</span>
      <span class="learn-chevron" aria-hidden="true">${isOpen ? "−" : "+"}</span></button>`;
    if (!isOpen) return `<li class="learn-item">${head}</li>`;
    const chosen = answers[lesson.id];
    const answered = chosen !== undefined, right = answered && chosen === t.answer;
    const options = t.options.map((option, i) => {
      const cls = !answered ? "" : i === t.answer && right ? "right" : i === chosen ? "wrong" : "";
      return `<button type="button" class="learn-option ${cls}" data-action="learn-answer" data-id="${lesson.id}" data-i="${i}" ${right ? "disabled" : ""}>${esc(option)}</button>`;
    }).join("");
    const feedback = !answered ? "" : right
      ? `<div class="learn-feedback right" role="status">${icon("check")}<div><strong>${esc(w.right)}</strong><span>${esc(t.explain)}</span></div></div>`
      : `<div class="learn-feedback wrong" role="status">${icon("alert")}<div><strong>${esc(w.wrong)}</strong><span>${esc(w.again)}</span></div></div>`;
    const nextLesson = LESSONS[index + 1];
    return `<li class="learn-item open">${head}
      <div class="learn-body">
        <p>${esc(t.why)}</p>
        <div class="learn-yours">${icon(lesson.icon)}<div><strong>${esc(w.yours)}</strong><span>${esc(t.yours(f))}</span></div></div>
        <p class="learn-tip"><strong>${esc(w.tip)}:</strong> ${esc(t.tip)}</p>
        <div class="learn-quiz"><strong>${esc(w.check)}: ${esc(t.q)}</strong><div class="learn-options">${options}</div>${feedback}</div>
        <div class="learn-actions"><button type="button" class="button ghost small" data-view="${lesson.go}">${esc(t.goLabel)}</button>
          ${right && nextLesson ? `<button type="button" class="button primary small" data-action="learn-open" data-id="${nextLesson.id}">${esc(w.next)} →</button>` : ""}</div>
      </div></li>`;
  }

  function render() {
    const d = state.dashboard, w = UI[lang()];
    if (!d) return `<div class="loading">Loading…</div>`;
    const f = facts(d), finished = done();
    const n = LESSONS.filter((lesson) => finished.has(lesson.id)).length;
    return `<div class="learn" lang="${lang()}">
      <section class="card learn-top"><p>${esc(w.intro)}</p>
        <div class="learn-progress"><span>${esc(fill(w.progress, {n: num(n), total: num(LESSONS.length)}))}</span>${meter(n, LESSONS.length)}
          ${n ? `<button type="button" class="button ghost small" data-action="learn-reset">${esc(w.reset)}</button>` : ""}</div>
        ${n === LESSONS.length ? `<div class="alert success section-gap" role="status">${icon("check")}<div><strong>${esc(w.allDone)}</strong></div></div>` : ""}</section>
      <ol class="learn-list">${LESSONS.map((lesson, index) => lessonHtml(lesson, index, f, finished, w)).join("")}</ol>
      <p class="hint">${esc(w.note)}</p></div>`;
  }

  let render_ = () => {};
  function action(name, data) {
    if (name === "open") { openId = openId === data.id ? "" : data.id; }
    else if (name === "answer") {
      const lesson = LESSONS.find((item) => item.id === data.id);
      if (!lesson) return;
      answers[data.id] = Number(data.i);
      if (answers[data.id] === lesson[lang()].answer) { const set = done(); set.add(data.id); save(set); }
    } else if (name === "reset") {
      save(new Set());
      Object.keys(answers).forEach((key) => delete answers[key]);
      openId = LESSONS[0].id;
    }
    render_();
    if (name === "open" && openId) document.querySelector(`.learn-head[data-id="${openId}"]`)?.scrollIntoView({block: "nearest"});
  }
  return {render, action, bind(renderer) { render_ = renderer; }, LESSONS};
})();
