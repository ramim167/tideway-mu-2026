"use strict";

// বাংলা interface layer. When Bangla is selected, every piece of interface text on screen (headings,
// buttons, labels, tables, dialogs, placeholders) is shown in Bangla; switching back restores English.
// Business data is never translated: customer and supplier names, amounts, dates, IDs and the text of
// records stay exactly as stored. Numbers, amounts, dates and ledger names inside a sentence become
// placeholders ({0}, {1}...), so one translated template covers every value.
window.TidewayBangla = (() => {
  const DICT = window.TIDEWAY_BN || {};
  const SKIP = "script,style,code,pre,textarea,svg,.msg,.lab-json,.message-preview,.no-translate,[data-no-translate],.record-text";
  const ATTRS = ["placeholder", "title", "aria-label", "data-prompt", "alt"];
  const MONTHS = {Jan: "জানু", Feb: "ফেব্রু", Mar: "মার্চ", Apr: "এপ্রি", May: "মে", Jun: "জুন", Jul: "জুলাই", Aug: "আগ", Sep: "সেপ্টে", Oct: "অক্টো", Nov: "নভে", Dec: "ডিসে"};
  // Full or short month names, never a prefix of a longer word ("Nov" must not match inside "November" alone).
  const MONTH_RE = "(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)(?![a-z])";
  let lang = "en", names = [], namesRe = null, scheduled = false, applying = false;
  const tracked = new Set();          // text nodes we changed: node -> restore on English
  const english = new WeakMap();      // text node -> its English text
  const shown = new WeakMap();        // text node -> the Bangla text we wrote
  const attrEnglish = new WeakMap();  // element -> {attr: English value}
  const attrTracked = new Set();

  const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  function setNames(list) {
    const clean = [...new Set((list || []).map(String).filter((s) => s && s.length > 1 && /[A-Za-z]/.test(s)))].sort((a, b) => b.length - a.length);
    names = clean;
    namesRe = clean.length ? clean.map(escapeRe).join("|") : null;
  }

  // Values that are kept as they are and passed through as placeholders.
  function tokenRe() {
    const parts = [];
    if (namesRe) parts.push(`(?:${namesRe})(?![A-Za-z])`);
    parts.push(
      "[−\\-–]?≈?\\s?(?:[A-Z]{3}|৳|\\$)\\s?[−\\-–]?\\d[\\d,]*(?:\\.\\d+)?",          // money: BDT 1,234.56, −BDT 42,000
      "\\d{4}-\\d{2}-\\d{2}(?:[T ]\\d{2}:\\d{2}(?::\\d{2})?)?",                    // ISO dates and times
      `\\d{1,2} ${MONTH_RE}(?: \\d{4})?`,                                         // 31 Oct, 31 Oct 2026
      `${MONTH_RE} \\d{1,2}(?:, \\d{4})?`,                                        // Oct 31
      "\\d{1,2}:\\d{2}(?::\\d{2})?",                                              // times
      "\\b[0-9a-f]{8,}\\b(?:…|\\.\\.\\.)?",                                       // hashes
      "\\b[a-z]+(?:-[a-z0-9]+){2,}\\b",                                          // record ids like inv-shapla-bay-oct
      "\\d+(?:[.,]\\d+)*(?:\\s?%)?",                                              // numbers and percentages
    );
    return new RegExp(parts.join("|"), "g");
  }

  function template(text) {
    const values = [];
    const key = text.replace(tokenRe(), (m) => `{${values.push(m) - 1}}`);
    return {key, values};
  }

  function localizeValue(v) {
    return v.replace(new RegExp(`\\b${MONTH_RE}`, "g"), (m) => MONTHS[m.slice(0, 3)] || m);
  }

  function translate(text) {
    const trimmed = text.trim();
    if (!trimmed || !/[A-Za-z]/.test(trimmed)) return null;
    if (DICT[trimmed] !== undefined) return text.replace(trimmed, DICT[trimmed]);
    const {key, values} = template(trimmed);
    const found = DICT[key];
    if (found === undefined) return null;
    const out = found.replace(/\{(\d+)\}/g, (_, i) => localizeValue(values[Number(i)] ?? ""));
    return text.replace(trimmed, out);
  }

  function skipped(node) {
    const parent = node.parentElement;
    return !parent || !!parent.closest(SKIP);
  }

  function apply(root = document.body) {
    if (lang !== "bn" || !root) return;
    applying = true;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (skipped(node)) continue;
      const current = node.nodeValue;
      if (shown.get(node) === current) continue;          // already ours
      const out = translate(current);
      if (out === null) continue;
      english.set(node, current);
      shown.set(node, out);
      tracked.add(node);
      node.nodeValue = out;
    }
    const scope = root.nodeType === 1 ? root : document.body;
    for (const el of [scope, ...scope.querySelectorAll(ATTRS.map((a) => `[${a}]`).join(","))]) {
      if (!el.getAttribute || el.closest(SKIP)) continue;
      for (const attr of ATTRS) {
        const value = el.getAttribute(attr);
        if (!value) continue;
        const saved = attrEnglish.get(el) || {};
        if (saved[`bn:${attr}`] === value) continue;
        const out = translate(value);
        if (out === null) continue;
        saved[attr] = value; saved[`bn:${attr}`] = out;
        attrEnglish.set(el, saved); attrTracked.add(el);
        el.setAttribute(attr, out);
      }
    }
    applying = false;
  }

  function restore() {
    applying = true;
    for (const node of tracked) {
      if (node.isConnected && shown.get(node) === node.nodeValue) node.nodeValue = english.get(node);
    }
    tracked.clear();
    for (const el of attrTracked) {
      const saved = attrEnglish.get(el) || {};
      for (const attr of ATTRS) if (saved[attr] !== undefined && el.getAttribute(attr) === saved[`bn:${attr}`]) el.setAttribute(attr, saved[attr]);
      attrEnglish.delete(el);
    }
    attrTracked.clear();
    applying = false;
  }

  function schedule() {
    if (scheduled || lang !== "bn") return;
    scheduled = true;
    requestAnimationFrame(() => { scheduled = false; apply(); });
  }

  const observer = new MutationObserver(() => { if (!applying) schedule(); });

  function setLang(next) {
    lang = next === "bn" ? "bn" : "en";
    document.documentElement.lang = lang;
    if (lang === "bn") { apply(); observer.observe(document.body, {subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS}); }
    else { observer.disconnect(); restore(); }
  }

  // Coverage check: interface text on screen that has no Bangla yet (used by scripts/bangla_coverage.mjs).
  const ALLOWED = /^(?:[A-Z]{2,5}|TideLM|TidePay|TideVision|Tideway|bKash|Nagad|Rocket|BUET|MFI|SME|SMS|OTP|PIN|PDF|CSV|JSON|HTML|ISO|API|AI|URL|USSD|ID|UPI|TrxID|HMAC|Ed25519|SHA-256|sha256|Qwen3|MLX|LoRA|CUDA|OWASP|P10|P50|P80|P90|HHI|DSO|APR|IBAN|BDT|USD|EUR|NID|WhatsApp|Wise|SEPA|M-Pesa|GCash|Pix|Alipay|WeChat|PayNow|DuitNow|Hinglish|Banglish|English|বাংলা|Español|Français|Português|Bahasa|中文|v\d+)$/;
  function missing(root = document.body) {
    const out = new Map();
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (skipped(node)) continue;
      const parent = node.parentElement;
      if (!parent.offsetParent && getComputedStyle(parent).position !== "fixed") continue;  // not visible
      const text = node.nodeValue.trim();
      if (!text || !/[A-Za-z]{2,}/.test(text)) continue;
      if (/[ঀ-৿]/.test(text)) continue;  // already Bangla; remaining Latin words are brands or codes kept on purpose
      const {key} = template(text);
      const residue = key.replace(/\{\d+\}/g, " ").split(/[^A-Za-z0-9\-_.]+/).filter((w) => /[A-Za-z]{2,}/.test(w) && !ALLOWED.test(w) && !/^[a-z]+_[a-z_]+$/.test(w) && !/^[a-z]+\.[a-z_.]+$/.test(w));
      if (!residue.length) continue;
      if (DICT[text] === undefined && DICT[key] === undefined) out.set(key, (out.get(key) || 0) + 1);
    }
    // Dropdown options are hidden until opened, so check them regardless of visibility.
    for (const option of root.querySelectorAll("select option")) {
      const text = option.textContent.trim();
      const optionKey = template(text).key;
      if (text && /[A-Za-z]{3,}/.test(optionKey.replace(/\{\d+\}/g, "")) && !/[ঀ-৿]/.test(text) && option.closest("select:not(#display-currency):not(#signup-currency)") && translate(text) === null) out.set(optionKey, 1);
    }
    const currencyPicker = root.querySelector("#display-currency option[value='']");
    if (currencyPicker && translate(currencyPicker.textContent) === null && !/[ঀ-৿]/.test(currencyPicker.textContent)) out.set(currencyPicker.textContent.trim(), 1);
    for (const el of root.querySelectorAll("[placeholder],[title],[aria-label]")) {
      if (el.closest(SKIP)) continue;
      for (const attr of ["placeholder", "title", "aria-label"]) {
        const v = el.getAttribute(attr);
        if (v && /[A-Za-z]{3,}/.test(v) && translate(v) === null && !/[ঀ-৿]/.test(v)) out.set(template(v.trim()).key, 1);
      }
    }
    return [...out.keys()];
  }

  return {setLang, setNames, apply, translate, template, missing, get lang() { return lang; }};
})();
