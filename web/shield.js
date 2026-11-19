"use strict";

// Scam Shield UI: paste a bKash / Nagad / Rocket SMS, WhatsApp message or call script and get a
// bilingual (English + বাংলা) verdict with reasons and safe next steps. Read-only: the server
// saves, blocks and pays nothing. Every server string is escaped before rendering.
window.TidewayShield = (() => {
  let text = "", sender = "", result = null, failure = "", lang = "both", renderGlobal = () => {};
  const SAMPLES = {
    fakeCashIn: {label: "Fake cash-in SMS", sender: "01712345678",
      text: "You have received Tk 5,000.00 from 01712345678. Ref order. Fee Tk 0.00. Balance Tk 5,410.00. TrxID 8N7A6B5C4D at 20/11/2026 10:15"},
    wrongSend: {label: "“Sent by mistake” call", sender: "01811223344",
      text: "ভাই ভুল করে আপনার নাম্বারে ৫০০০ টাকা চলে গেছে। দয়া করে টাকাটা ফেরত দিন, খুব বিপদে আছি।"},
    pin: {label: "PIN / OTP request", sender: "01655667788",
      text: "bKash head office theke bolchi. Apnar account bondho hoye jabe. Account chalu rakhte PIN ar OTP code ta bolen."},
    prize: {label: "Prize fee", sender: "01799001122",
      text: "Congratulations! You have won Tk 50,000 in the Nagad lucky draw. Send Tk 500 registration fee to 01811223344 to claim your prize today."},
    genuine: {label: "Genuine bKash SMS", sender: "bKash",
      text: "You have received Tk 1,500.00 from 01712345678. Ref rent. Fee Tk 0.00. Balance Tk 8,240.50. TrxID 8N7A6B5C4D at 20/11/2026 10:15"},
  };
  const VERDICT = {
    likely_scam: {cls: "storm", en: "Likely scam", bn: "সম্ভবত প্রতারণা", icon: "alert"},
    suspicious: {cls: "unsettled", en: "Suspicious: verify first", bn: "সন্দেহজনক: আগে যাচাই করুন", icon: "alert"},
    no_red_flags: {cls: "clear", en: "No known red flags", bn: "পরিচিত কোনো ঝুঁকি পাওয়া যায়নি", icon: "check"},
  };
  const mode = () => (lang === "both" && state.lang === "bn" ? "bn" : lang);
  const pick = (item) => mode() === "en" ? `<span>${esc(item.en)}</span>` : mode() === "bn" ? `<span lang="bn">${esc(item.bn)}</span>`
    : `<span>${esc(item.en)}</span><span class="bn-line" lang="bn">${esc(item.bn)}</span>`;

  function meter(score, cls) {
    const value = Math.max(0, Math.min(100, Number(score) || 0));
    // SVG attributes, not inline styles: the app's Content Security Policy blocks style attributes.
    return `<svg class="shield-meter" viewBox="0 0 100 8" preserveAspectRatio="none" role="img" aria-label="Risk score ${value} of 100">
      <rect class="shield-meter-track" width="100" height="8" rx="4"></rect><rect class="shield-meter-fill ${cls}" width="${value}" height="8" rx="4"></rect></svg>`;
  }

  function resultHtml() {
    if (failure) return `<div class="alert critical section-gap" role="alert">${icon("x")}<div><strong>Could not check</strong><span>${esc(failure)}</span></div></div>`;
    if (!result) return `<div class="card section-gap shield-empty"><h3>How it decides</h3><ul class="small">
      <li><strong>Red-flag rules</strong> for scams common in Bangladesh: PIN/OTP requests, “sent by mistake, send it back”, fake cash-in SMS, prize fees, account-block threats, fake officials and links.</li>
      <li><strong>A learned text model</strong> (naive Bayes over words and character n-grams) trained on labelled English, বাংলা and Banglish messages. It is one signal, shown with its probability.</li>
      <li><strong>Who sent it matters.</strong> A fake cash-in SMS can copy the real text exactly; real notices come from the provider's name, not an 01X number.</li></ul></div>`;
    const v = VERDICT[result.verdict] || VERDICT.suspicious;
    const claims = result.claims || {};
    const facts = [
      result.provider ? `Provider mentioned: <strong>${esc(result.provider)}</strong>` : "",
      claims.money_received ? `Claims money received${isNum(claims.amount_bdt) ? `: <strong>Tk ${esc(claims.amount_bdt.toLocaleString("en-US"))}</strong>` : ""}` : "",
      claims.transaction_id ? `Transaction ID in text: <code>${esc(claims.transaction_id)}</code> (an ID in an SMS proves nothing on its own)` : "",
      result.sender ? `Sender: <strong>${esc(result.sender)}</strong>${result.sender_is_phone_number ? " (a personal phone number)" : ""}` : "",
      (claims.phone_numbers_in_message || []).length ? `Phone numbers in the message: ${claims.phone_numbers_in_message.map((n) => `<code>${esc(n)}</code>`).join(", ")}` : "",
    ].filter(Boolean);
    const model = result.model || {};
    return `<section class="card section-gap shield-result ${v.cls}" aria-live="polite">
      <div class="card-head"><div><span class="pill ${v.cls}">${icon(v.icon)}${esc(v.en)}</span>
        <h3 class="shield-verdict">${esc(v.en)} <span lang="bn" class="bn-line">${esc(v.bn)}</span></h3>
        <p>Risk score ${esc(result.risk_score)} of 100 · ${esc((result.signals || []).length)} signal(s)</p></div>
        <div class="segmented" role="group" aria-label="Language">${["both", "en", "bn"].map((code) => `<button type="button" class="button small ${lang === code ? "primary" : "ghost"}" data-action="shield-lang" data-lang="${code}">${{both: "EN + বাংলা", en: "English", bn: "বাংলা"}[code]}</button>`).join("")}</div></div>
      ${meter(result.risk_score, v.cls)}
      ${(result.signals || []).length ? `<h4 class="section-gap">Why</h4><ul class="shield-list">${result.signals.map((s) => `<li><span class="tag ${s.weight >= 40 ? "bad" : ""}">+${esc(s.weight)}</span><div>${pick(s)}${s.words?.length ? `<span class="hint">Words that weighed most: ${s.words.map((w) => `<code>${esc(w)}</code>`).join(" ")}</span>` : ""}</div></li>`).join("")}</ul>` : ""}
      <h4 class="section-gap">What to do</h4><ol class="shield-list">${(result.actions || []).map((a) => `<li><div>${pick(a)}</div></li>`).join("")}</ol>
      ${facts.length ? `<details class="section-gap"><summary>What Tideway read from the message</summary><ul class="small">${facts.map((f) => `<li>${f}</li>`).join("")}</ul></details>` : ""}
      <details class="section-gap"><summary>Learned model</summary><p class="small">${esc(model.name || "")}: P(scam) = ${esc(Math.round((model.probability_scam || 0) * 100))}%. Trained on ${esc(model.training || "")}. Synthetic data: treat it as a second opinion, not proof.</p></details>
      <p class="hint section-gap">${esc(result.note || "")}</p></section>`;
  }

  function render() {
    return `<section class="grid split"><form class="card" id="shield-form">
        <div class="card-head"><div><h3>Is this message a scam? <span lang="bn" class="bn-line">এই মেসেজটি কি প্রতারণা?</span></h3>
          <p>Paste a bKash, Nagad or Rocket SMS, a WhatsApp message or what a caller said. English, বাংলা and Banglish all work. Nothing is saved.</p></div>
          <span class="pill teal">${icon("shield")}Scam Shield</span></div>
        <label class="field">Message<textarea id="shield-text" maxlength="2000" spellcheck="false" placeholder="e.g. You have received Tk 5,000.00 from 017… Please send back by mistake…">${esc(text)}</textarea></label>
        <label class="field section-gap">Sender, as shown on your phone (optional)<input id="shield-sender" maxlength="40" value="${esc(sender)}" placeholder="bKash, NAGAD, 16216 or 017XXXXXXXX" autocomplete="off"><span class="hint">Real transaction SMS come from the provider's name. A phone number here is a strong warning sign.</span></label>
        <div class="row section-gap"><button class="button primary" type="submit">${icon("shield")}Check message</button>
          ${result || text ? `<button class="button ghost" type="button" data-action="shield-clear">Clear</button>` : ""}</div>
        <p class="small muted section-gap">Try a sample:</p>
        <div class="row wrap">${Object.entries(SAMPLES).map(([key, s]) => `<button class="button small ghost" type="button" data-action="shield-sample" data-sample="${key}">${esc(s.label)}</button>`).join("")}</div>
      </form>
      <div class="card"><h3>Golden rules <span lang="bn" class="bn-line">যে নিয়মগুলো কখনো ভাঙবেন না</span></h3><ul class="small shield-rules">
        <li>Never share your PIN or OTP. <span lang="bn">পিন বা ওটিপি কাউকে দেবেন না।</span></li>
        <li>Check your balance in the official app before handing over goods. <span lang="bn">মাল দেওয়ার আগে অ্যাপে ব্যালেন্স দেখুন।</span></li>
        <li>Never “return” money because of an SMS or a call. <span lang="bn">এসএমএস বা ফোন পেয়ে টাকা ফেরত দেবেন না।</span></li>
        <li>Real prizes never need a fee. <span lang="bn">আসল পুরস্কারে কোনো ফি লাগে না।</span></li>
        <li>Official helplines: bKash 16247 · Nagad 16167 · Rocket 16216.</li></ul></div></section>
      <div id="shield-result">${resultHtml()}</div>`;
  }

  async function check() {
    if (!text.trim()) { toast("Paste a message first."); return; }
    failure = "";
    const response = await act("Scam Shield", () => api("/api/shield/check", {text, sender}));
    if (response) result = response; else if (!result) failure = "The check did not complete. Try again.";
    renderGlobal();
  }

  async function action(name, data) {
    if (name === "sample") { const s = SAMPLES[data.sample]; if (s) { text = s.text; sender = s.sender; result = null; failure = ""; renderGlobal(); await check(); } }
    else if (name === "clear") { text = ""; sender = ""; result = null; failure = ""; renderGlobal(); }
    else if (name === "lang") { lang = data.lang; renderGlobal(); }
  }

  document.addEventListener("input", (event) => {
    if (event.target.id === "shield-text") text = event.target.value;
    else if (event.target.id === "shield-sender") sender = event.target.value;
  });
  document.addEventListener("submit", (event) => {
    if (event.target.id !== "shield-form") return;
    event.preventDefault();
    check().catch((error) => toast(error.message));
  });

  return {render, action, bind(renderer) { renderGlobal = renderer; }, resultHtml: (r) => { const saved = result; result = r; const html = resultHtml(); result = saved; return html; }};
})();
