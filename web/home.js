"use strict";

// Home: the first screen an owner sees. It answers four questions in plain words, in English or বাংলা:
// Can I pay salaries? How low will my cash go? Who owes me money? What should I do now?
// It only reads the dashboard the server already computed; it never calculates a forecast or moves money.
window.TidewayHome = (() => {
  const T = {
    en: {
      hello: "Hello", today: "Today is", practice: "Practice mode: these are example businesses. No real money moves.",
      cashToday: "Cash today", cashTodayNote: "Money in the business now",
      lowest: "Lowest point coming", lowestNote: "on {date}",
      owedToYou: "Customers owe you", owedNote: "{n} unpaid bill(s)",
      youOwe: "You owe suppliers", youOweNote: "Bills not paid yet",
      safety: "Safety money", safetyNote: "Cash you never want to go below",
      payroll_unfunded: ["Salary money will run short", "Salaries of {payroll} are due on {payday}. If nothing changes, your cash falls to {low} by {lowdate}. You need about {gap} more to stay safe."],
      buffer_shortfall_unknown_payroll: ["Your safety money runs low, and payroll is unknown", "Cash dips below your reserve by {gap}. Add your salary date and amount to check payday."],
      buffer_shortfall: ["Salaries are covered, but your safety money runs low", "Your cash dips to {low} on {lowdate}, below the {safety} you want to keep aside. You need about {gap} more."],
      likely_path_holds: ["You can pay salaries", "Your cash stays above your safety money ({safety}) through {end}. Keep checking as customers pay."],
      no_payroll_identified: ["Cash looks fine, but no salary payment is recorded", "Add your salary date and amount so Tideway can check payday for you."],
      no_records: ["Add your first records", "Paste a bank or bKash SMS, or import a spreadsheet, and Tideway will start checking your cash."],
      historical_horizon: ["Pick a future date", "The date you chose is already in the past. Choose a later date at the top of the page."],
      fix: "Show me how to fix it", ask: "Ask in বাংলা or English", askPrompt: "Can I pay salaries this month?",
      seeForecast: "See the full forecast", addRecord: "Add your first record",
      chartTitle: "Your cash, day by day", chartNote: "Green: safe. Amber: below your safety money. Red: not enough money.",
      chartPayday: "Salary day", chartSafety: "Safety money",
      tasksTitle: "What do you want to do?",
      tasks: {
        rescue: ["Fix a cash gap", "Tideway finds the cheapest way: ask a supplier for more time or offer a small discount for early payment. You decide."],
        shield: ["Check a suspicious SMS", "Got a “you received money” SMS, or a call asking for your PIN? Check it here before you act."],
        assistant: ["Ask a question", "Type in বাংলা or English, for example “এই মাসে কি বেতন দিতে পারব?”"],
        inbox: ["Add from SMS", "Paste a bKash, Nagad or bank SMS. Tideway writes the record; you check and save it."],
      },
      owedTitle: "Who owes you money", owedEmpty: "Nobody owes you money right now.",
      expected: "Expected {date}", afterPayday: "Arrives after salary day",
      latePattern: "Usually pays late ({late} of {n} times)", onTime: "Usually pays on time", newCustomer: "New customer: little history",
      askAbout: "Ask about {name}", askAboutPrompt: "How does {name} usually pay?",
      billsTitle: "Bills coming up", billsEmpty: "No unpaid bills.", due: "Due {date}", overdue: "Overdue since {date}",
      blockedBill: "Do not pay yet: {reason}", checkSafety: "Check safety",
      watchTitle: "Watch out", allClear: "No fraud warnings for this business.",
      warn: {
        payee_account_changed: "A supplier's bank details changed. Call the number you already have to confirm before paying.",
        lookalike_payee: "A payee name looks like a real supplier's name. It may be a fake.",
        untrusted_text: "Some saved messages contain hidden instructions. Tideway treats them as plain text only.",
      },
      viewerNote: "You can look, but only the owner or accountant can make a plan.",
    },
    bn: {
      hello: "আসসালামু আলাইকুম", today: "আজ", practice: "অনুশীলন মোড: এগুলো উদাহরণ ব্যবসা। কোনো আসল টাকা লেনদেন হয় না।",
      cashToday: "আজকের নগদ টাকা", cashTodayNote: "এখন ব্যবসায় যে টাকা আছে",
      lowest: "সামনে সবচেয়ে কম টাকা", lowestNote: "{date} তারিখে",
      owedToYou: "ক্রেতাদের কাছে পাওনা", owedNote: "{n}টি বিল বাকি",
      youOwe: "সরবরাহকারীদের দেনা", youOweNote: "এখনো পরিশোধ হয়নি",
      safety: "নিরাপত্তার টাকা", safetyNote: "এর নিচে নগদ নামতে দিতে চান না",
      payroll_unfunded: ["বেতনের টাকা কম পড়বে", "{payday} তারিখে {payroll} বেতন দিতে হবে। কিছু না করলে {lowdate}-এর মধ্যে নগদ নেমে যাবে {low}-এ। নিরাপদ থাকতে আরও প্রায় {gap} লাগবে।"],
      buffer_shortfall_unknown_payroll: ["নগদ রিজার্ভে ঘাটতি আছে, বেতনের তথ্য নেই", "নগদ রিজার্ভের চেয়ে {gap} কম হবে। বেতন যাচাই করতে তারিখ ও পরিমাণ যোগ করুন।"],
      buffer_shortfall: ["বেতন দেওয়া যাবে, তবে নিরাপত্তার টাকা কমে যাবে", "{lowdate} তারিখে নগদ নেমে যাবে {low}-এ, যা আপনার {safety} নিরাপত্তার টাকার চেয়ে কম। আরও প্রায় {gap} লাগবে।"],
      likely_path_holds: ["বেতন দিতে পারবেন", "{end} পর্যন্ত নগদ টাকা নিরাপত্তার টাকার ({safety}) উপরে থাকবে। ক্রেতারা টাকা দিলে আবার দেখে নিন।"],
      no_payroll_identified: ["নগদ ঠিক আছে, কিন্তু বেতনের কোনো রেকর্ড নেই", "বেতনের তারিখ ও পরিমাণ যোগ করুন, তাহলে টাইডওয়ে বেতনের দিন যাচাই করতে পারবে।"],
      no_records: ["প্রথম হিসাব যোগ করুন", "ব্যাংক বা বিকাশের এসএমএস পেস্ট করুন বা স্প্রেডশিট আনুন, টাইডওয়ে নগদ যাচাই শুরু করবে।"],
      historical_horizon: ["সামনের একটি তারিখ বেছে নিন", "আপনার বাছাই করা তারিখ পার হয়ে গেছে। উপরে পরের একটি তারিখ বেছে নিন।"],
      fix: "কীভাবে ঠিক করব দেখান", ask: "বাংলায় প্রশ্ন করুন", askPrompt: "এই মাসে কি বেতন দিতে পারব?",
      seeForecast: "পুরো পূর্বাভাস দেখুন", addRecord: "প্রথম হিসাব যোগ করুন",
      chartTitle: "দিন অনুযায়ী আপনার নগদ টাকা", chartNote: "সবুজ: নিরাপদ। হলুদ: নিরাপত্তার টাকার নিচে। লাল: টাকা যথেষ্ট নয়।",
      chartPayday: "বেতনের দিন", chartSafety: "নিরাপত্তার টাকা",
      tasksTitle: "আপনি কী করতে চান?",
      tasks: {
        rescue: ["টাকার ঘাটতি মেটান", "সবচেয়ে কম খরচের উপায় খুঁজে দেয়: সরবরাহকারীর কাছে সময় চাওয়া বা আগে টাকা দিলে ক্রেতাকে ছোট ছাড়। সিদ্ধান্ত আপনার।"],
        shield: ["সন্দেহজনক এসএমএস যাচাই", "“টাকা পেয়েছেন” এসএমএস বা পিন চেয়ে ফোন? কিছু করার আগে এখানে যাচাই করুন।"],
        assistant: ["প্রশ্ন করুন", "বাংলা বা ইংরেজিতে লিখুন, যেমন “এই মাসে কি বেতন দিতে পারব?”"],
        inbox: ["এসএমএস থেকে হিসাব", "বিকাশ, নগদ বা ব্যাংকের এসএমএস পেস্ট করুন। টাইডওয়ে হিসাব লিখে দেবে; আপনি দেখে সংরক্ষণ করবেন।"],
      },
      owedTitle: "কে আপনার কাছে টাকা বাকি রেখেছে", owedEmpty: "এখন কারো কাছে কোনো পাওনা নেই।",
      expected: "আশা করা যায় {date}", afterPayday: "বেতনের দিনের পরে আসবে",
      latePattern: "সাধারণত দেরিতে দেন ({n} বারের {late} বার)", onTime: "সাধারণত সময়মতো দেন", newCustomer: "নতুন ক্রেতা: ইতিহাস কম",
      askAbout: "{name} সম্পর্কে জানুন", askAboutPrompt: "{name} সাধারণত কীভাবে টাকা দেয়?",
      billsTitle: "সামনের বিল", billsEmpty: "কোনো বকেয়া বিল নেই।", due: "শেষ তারিখ {date}", overdue: "{date} থেকে বকেয়া",
      blockedBill: "এখন পরিশোধ করবেন না: {reason}", checkSafety: "নিরাপত্তা দেখুন",
      watchTitle: "সাবধান", allClear: "এই ব্যবসার জন্য কোনো প্রতারণার সতর্কতা নেই।",
      warn: {
        payee_account_changed: "একজন সরবরাহকারীর ব্যাংক তথ্য বদলেছে। টাকা দেওয়ার আগে আগের জানা নাম্বারে ফোন করে নিশ্চিত হন।",
        lookalike_payee: "একটি প্রাপকের নাম আসল সরবরাহকারীর নামের মতো দেখতে। এটি ভুয়া হতে পারে।",
        untrusted_text: "কিছু সংরক্ষিত মেসেজে লুকানো নির্দেশ আছে। টাইডওয়ে এগুলোকে শুধু লেখা হিসেবে দেখে।",
      },
      viewerNote: "আপনি দেখতে পারবেন, কিন্তু পরিকল্পনা শুধু মালিক বা হিসাবরক্ষক করতে পারেন।",
    },
  };
  const BN_MONTHS = "জানু ফেব্রু মার্চ এপ্রি মে জুন জুলাই আগ সেপ্টে অক্টো নভে ডিসে".split(" ");
  const TONE = {payroll_unfunded: "storm", buffer_shortfall: "unsettled", buffer_shortfall_unknown_payroll: "unsettled", likely_path_holds: "clear", no_payroll_identified: "info", no_records: "info", historical_horizon: "info"};
  const ICON = {storm: "alert", unsettled: "alert", clear: "check", info: "spark"};
  const TASK_ICON = {rescue: "rescue", shield: "shield", assistant: "chat", inbox: "inbox"};
  const CHIP = {en: {storm: "Act now", unsettled: "Watch out", clear: "All good", info: "Next step"},
    bn: {storm: "এখনই ব্যবস্থা নিন", unsettled: "সাবধান", clear: "সব ঠিক আছে", info: "পরের ধাপ"}};

  const lang = () => (state.lang === "bn" ? "bn" : "en");
  const words = () => T[lang()];
  const fill = (text, values) => String(text).replace(/\{(\w+)\}/g, (_, key) => values[key] ?? "");
  const date = (value) => {
    if (!value) return "—";
    if (lang() === "en") return day(value);
    const d = new Date(`${String(value).slice(0, 10)}T12:00:00Z`);
    return `${d.getUTCDate()} ${BN_MONTHS[d.getUTCMonth()]}`;
  };
  const cash = (minor) => (isNum(minor) ? money(minor) : "—");

  function cashToday(d) {
    const days = d.projections?.likely?.days || [];
    const now = d.state?.current_date;
    const row = days.find((item) => item.date === now);
    return row ? row.opening_cash_minor : d.business?.opening_cash_minor;
  }

  function hero(d, w) {
    const ov = d.owner_view || {};
    const status = ov.status in TONE ? ov.status : "likely_path_holds";
    const tone = TONE[status];
    const [title, body] = w[status];
    const values = {payroll: cash(ov.payroll?.next_amount_minor), payday: date(ov.payroll?.next_date), low: cash(ov.likely?.minimum_cash_minor),
      lowdate: date(ov.likely?.minimum_cash_date), gap: cash(ov.likely?.reserve_shortfall_minor), safety: cash(ov.reserve_floor_minor), end: date(ov.end_date)};
    const needsFix = tone === "storm" || tone === "unsettled";
    const fixButton = needsFix
      ? `<button class="button primary home-cta" type="button" data-action="home-fix">${icon("rescue")}${esc(w.fix)}</button>`
      : canApprove() && (status === "no_records" || status === "no_payroll_identified")
        ? `<button class="button primary home-cta" type="button" data-view="inbox">${icon("inbox")}${esc(w.addRecord)}</button>`
        : `<button class="button primary home-cta" type="button" data-view="overview">${icon("gauge")}${esc(w.seeForecast)}</button>`;
    return `<section class="home-hero ${tone}" aria-labelledby="home-hero-title">
      <span class="home-hero-icon" aria-hidden="true">${icon(ICON[tone])}</span>
      <div class="home-hero-text"><span class="home-status ${tone}">${esc(CHIP[lang()][tone])}</span><h2 id="home-hero-title">${esc(title)}</h2><p>${esc(fill(body, values))}</p>
        ${needsFix && !canApprove() ? `<p class="hint">${esc(w.viewerNote)}</p>` : ""}</div>
      <div class="home-hero-actions">${fixButton}
        <button class="button ghost" type="button" data-action="home-ask" data-prompt="${esc(w.askPrompt)}">${icon("chat")}${esc(w.ask)}</button></div>
    </section>`;
  }

  function tiles(d, w) {
    const ov = d.owner_view || {}, k = d.kpis || {};
    const unpaid = ov.data_checks?.unpaid_invoices ?? 0;
    const tile = (label, value, note, cls = "") => `<div class="metric home-tile ${cls}"><span class="label">${esc(label)}</span><span class="value">${value}</span><span class="note">${esc(note)}</span></div>`;
    const low = ov.likely?.minimum_cash_minor;
    return `<section class="metrics home-tiles" aria-label="${esc(lang() === "bn" ? "মূল হিসাব" : "Key numbers")}">
      ${tile(w.cashToday, cash(cashToday(d)), w.cashTodayNote)}
      ${tile(w.lowest, cash(low), fill(w.lowestNote, {date: date(ov.likely?.minimum_cash_date)}), isNum(low) && low < 0 ? "bad" : isNum(low) && low < (ov.reserve_floor_minor || 0) ? "warn" : "good")}
      ${tile(w.owedToYou, cash(k.open_receivables_minor), fill(w.owedNote, {n: unpaid}))}
      ${tile(w.safety, cash(ov.reserve_floor_minor), w.safetyNote)}
    </section>`;
  }

  function chart(d, w) {
    const ov = d.owner_view || {};
    const days = (d.projections?.likely?.days || []).filter((item) => !d.state?.current_date || item.date >= d.state.current_date);
    if (days.length < 2) return "";
    const values = days.map((item) => item.closing_cash_minor);
    const floor = ov.reserve_floor_minor || 0;
    const max = Math.max(...values, floor, 1), min = Math.min(...values, 0);
    const W = 720, H = 180, top = 8, bottom = 8, span = max - min || 1;
    const y = (v) => top + (H - top - bottom) * (1 - (v - min) / span);
    const step = W / days.length, bar = Math.max(2, step - 3);
    const zero = y(0), safetyY = y(floor);
    const payday = ov.payroll?.next_date;
    const bars = days.map((item, i) => {
      const v = item.closing_cash_minor, cls = v < 0 ? "bad" : v < floor ? "warn" : "good";
      const y1 = Math.min(y(v), zero), h = Math.max(1.5, Math.abs(zero - y(v)));
      return `<rect class="home-bar ${cls}" x="${(i * step + 1.5).toFixed(1)}" y="${y1.toFixed(1)}" width="${bar.toFixed(1)}" height="${h.toFixed(1)}" rx="2"><title>${esc(date(item.date))}: ${esc(cash(v))}</title></rect>`;
    }).join("");
    const paydayIndex = days.findIndex((item) => item.date === payday);
    const paydayMark = paydayIndex >= 0 ? `<line class="home-payday" x1="${(paydayIndex * step + step / 2).toFixed(1)}" x2="${(paydayIndex * step + step / 2).toFixed(1)}" y1="${top}" y2="${H - bottom}"></line>` : "";
    const lowest = values.indexOf(Math.min(...values));
    const summary = `${w.chartTitle}: ${date(days[0].date)} ${cash(values[0])}; ${w.lowest} ${cash(values[lowest])} (${date(days[lowest].date)}); ${date(days.at(-1).date)} ${cash(values.at(-1))}.`;
    return `<section class="card home-chart-card" aria-labelledby="home-chart-title">
      <div class="card-head"><div><h3 id="home-chart-title">${esc(w.chartTitle)}</h3><p>${esc(w.chartNote)}</p></div>
        <button class="button small ghost" type="button" data-view="overview">${esc(w.seeForecast)}</button></div>
      <svg class="home-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${esc(summary)}">
        <line class="home-zero" x1="0" x2="${W}" y1="${zero.toFixed(1)}" y2="${zero.toFixed(1)}"></line>
        <line class="home-safety" x1="0" x2="${W}" y1="${safetyY.toFixed(1)}" y2="${safetyY.toFixed(1)}"></line>
        ${bars}${paydayMark}
      </svg>
      <div class="home-chart-axis" aria-hidden="true"><span>${esc(date(days[0].date))}</span><span>${esc(date(days.at(-1).date))}</span></div>
      <div class="home-chart-legend">
        <span><i class="key good"></i>${esc(lang() === "bn" ? "নিরাপদ" : "Safe")}</span>
        <span><i class="key warn"></i>${esc(lang() === "bn" ? "নিরাপত্তার টাকার নিচে" : "Below safety money")}</span>
        <span><i class="key bad"></i>${esc(lang() === "bn" ? "টাকা যথেষ্ট নয়" : "Not enough money")}</span>
        <span><i class="key line safety"></i>${esc(w.chartSafety)}: ${esc(cash(floor))}</span>
        ${paydayIndex >= 0 ? `<span><i class="key line payday"></i>${esc(w.chartPayday)}: ${esc(date(payday))}</span>` : ""}
      </div></section>`;
  }

  function tasks(w) {
    return `<section aria-labelledby="home-tasks-title"><h3 class="home-section-title" id="home-tasks-title">${esc(w.tasksTitle)}</h3>
      <div class="home-tasks">${Object.entries(w.tasks).map(([view, [title, text]]) => `<button class="home-task" type="button" data-view="${view}">
        <span class="home-task-icon" aria-hidden="true">${icon(TASK_ICON[view])}</span><span class="home-task-text"><strong>${esc(title)}</strong><span>${esc(text)}</span></span>
        <span class="home-task-go" aria-hidden="true">→</span></button>`).join("")}</div></section>`;
  }

  function owed(d, w) {
    const rows = (d.owner_view?.customer_receipts || []).filter((row) => row.open_amount_minor > 0);
    const list = rows.map((row) => {
      const late = row.late_settlements || 0, n = row.settled_invoices || 0;
      const habit = row.limited_history ? `<span class="pill">${esc(w.newCustomer)}</span>`
        : late / Math.max(1, n) > 0.34 ? `<span class="pill unsettled">${esc(fill(w.latePattern, {late, n}))}</span>` : `<span class="pill clear">${esc(w.onTime)}</span>`;
      const receipt = row.next_receipt || {};
      return `<li class="home-row"><div class="home-row-main"><strong>${esc(row.customer)}</strong>
          <span class="muted">${esc(fill(w.expected, {date: date(receipt.date)}))}${receipt.after_payroll ? ` · <span class="home-late">${esc(w.afterPayday)}</span>` : ""}</span>
          <span class="home-row-tags">${habit}</span></div>
        <div class="home-row-side"><span class="home-amount">${esc(cash(row.open_amount_minor))}</span>
          <button class="button small ghost" type="button" data-action="home-ask" data-prompt="${esc(fill(w.askAboutPrompt, {name: row.customer}))}">${esc(fill(w.askAbout, {name: row.customer}))}</button></div></li>`;
    }).join("");
    return `<section class="card" aria-labelledby="home-owed-title"><h3 id="home-owed-title">${esc(w.owedTitle)}</h3>
      ${list ? `<ul class="home-list">${list}</ul>` : `<p class="muted section-gap">${esc(w.owedEmpty)}</p>`}</section>`;
  }

  function bills(d, w) {
    const now = d.state?.current_date || "";
    const blocked = d.blocked || {};
    const deferrals = new Map();
    for (const item of d.state?.adjustments || []) {
      if (item.kind !== "bill_deferral") continue;
      if (!deferrals.has(item.bill_id)) deferrals.set(item.bill_id, []);
      deferrals.get(item.bill_id).push(item);
    }
    const open = [];
    for (const bill of d.records?.bills || []) {
      if (!["open", "scheduled", "rescheduled"].includes(bill.status)) continue;
      let remaining = bill.amount_minor;
      for (const item of deferrals.get(bill.id) || []) {
        remaining -= item.amount_minor;
        open.push({...bill, due_date: item.to_date, amount_minor: item.amount_minor});
      }
      if (remaining > 0) open.push({...bill, due_date: bill.rescheduled_date || bill.due_date, amount_minor: remaining});
    }
    open.sort((a, b) => a.due_date.localeCompare(b.due_date));
    const list = open.slice(0, 4).map((bill) => `<li class="home-row"><div class="home-row-main"><strong>${esc(bill.payee)}</strong>
        <span class="muted">${esc(fill(bill.due_date < now ? w.overdue : w.due, {date: date(bill.due_date)}))}</span>
        ${blocked[bill.id] ? `<span class="home-row-tags"><span class="pill storm">${icon("lock")}${esc(fill(w.blockedBill, {reason: lang() === "bn" ? "ব্যাংক তথ্য বা নাম সন্দেহজনক" : blocked[bill.id]}))}</span></span>` : ""}</div>
      <div class="home-row-side"><span class="home-amount">${esc(cash(bill.amount_minor))}</span>
        ${blocked[bill.id] ? `<button class="button small ghost" type="button" data-view="security">${esc(w.checkSafety)}</button>` : ""}</div></li>`).join("");
    return `<section class="card" aria-labelledby="home-bills-title"><h3 id="home-bills-title">${esc(w.billsTitle)}</h3>
      ${list ? `<ul class="home-list">${list}</ul>` : `<p class="muted section-gap">${esc(w.billsEmpty)}</p>`}</section>`;
  }

  function watch(d, w) {
    const codes = [...new Set((d.warnings || []).map((item) => item.code).filter((code) => w.warn[code]))];
    if (!codes.length) return "";
    return `<section class="card home-watch" aria-labelledby="home-watch-title"><h3 id="home-watch-title">${icon("alert")}${esc(w.watchTitle)}</h3>
      <ul class="home-watch-list">${codes.map((code) => `<li>${esc(w.warn[code])}</li>`).join("")}</ul>
      <button class="button small ghost" type="button" data-view="security">${esc(w.checkSafety)}</button></section>`;
  }

  function render() {
    const d = state.dashboard, w = words();
    if (!d) return `<div class="loading">Loading…</div>`;
    const name = String(state.operator?.name || "").split(" ")[0];
    return `<div class="home" lang="${lang()}">
      <div class="home-greeting"><p><strong>${esc(w.hello)}${name ? `, ${esc(name)}` : ""}</strong> · ${esc(d.business?.name || "")}</p>
        <p class="muted">${esc(w.today)} ${esc(date(d.state?.current_date))} · ${esc(w.practice)}</p></div>
      ${hero(d, w)}
      ${typeof onboardingHtml === "function" ? onboardingHtml(d) : ""}
      ${tiles(d, w)}
      ${tasks(w)}
      ${chart(d, w)}
      <div class="grid cols-2 home-pair">${owed(d, w)}${bills(d, w)}</div>
      ${watch(d, w)}
    </div>`;
  }

  async function action(name, data) {
    if (name === "fix") {
      if (canApprove() && !state.dashboard?.plan) { await runAgent(); return; }
      state.view = "rescue"; render_(); window.scrollTo(0, 0); return;
    }
    if (name === "ask") { state.view = "assistant"; render_(); await ask(data.prompt); }
  }
  let render_ = () => {};
  return {render, action, bind(renderer) { render_ = renderer; }};
})();
