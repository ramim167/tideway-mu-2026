// Bangla coverage check: switches Tideway to বাংলা and walks every page and the important states
// (landing, Home, forecast simple and detailed, rescue plan, approval dialog, assistant, Scam check,
// Inbox drafts, What-if, Records, Team, every Decision lab / Treasury tab, Lender radar, Safety
// self-test, Audit drill, a fraud-blocked business and a viewer). It lists interface text that is
// still English. Business data (names, amounts, dates, record text) is excluded by design.
//
//   node scripts/bangla_coverage.mjs [--out missing.json] [--strict]
import {spawn} from "node:child_process";
import {mkdtempSync, writeFileSync, existsSync, mkdirSync} from "node:fs";
import {tmpdir} from "node:os";
import {join, dirname} from "node:path";
import {fileURLToPath} from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const option = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined; };
const OUT = option("--out");
const STRICT = process.argv.includes("--strict");
const SHOTS = option("--shots");
const PORT = Number(process.env.TIDEWAY_BN_PORT || 8797), DEBUG_PORT = Number(process.env.TIDEWAY_BN_DEBUG_PORT || 9337);
const CHROME = process.env.CHROME || ["C:/Program Files/Google/Chrome/Application/chrome.exe", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find(existsSync) || "google-chrome";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = [];

const work = mkdtempSync(join(tmpdir(), "tideway-bn-"));
const server = spawn(process.env.PYTHON || (process.platform === "win32" ? "python" : "python3"),
  [join(ROOT, "run.py"), "--db", join(work, "bn.sqlite3"), "--port", String(PORT)], {stdio: "ignore", windowsHide: true, env: {...process.env, OPENAI_API_KEY: ""}});
const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${DEBUG_PORT}`, `--user-data-dir=${join(work, "profile")}`,
  "--no-first-run", "--no-default-browser-check", "about:blank"], {stdio: "ignore", windowsHide: true});

async function waitFor(url, tries = 80) {
  for (let i = 0; i < tries; i += 1) { try { const r = await fetch(url); if (r.ok) return r; } catch (_) { /* not up */ } await sleep(250); }
  throw new Error(`Timed out waiting for ${url}`);
}
let socket, nextId = 0;
const pending = new Map();
const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++nextId; pending.set(id, {resolve, reject, method}); socket.send(JSON.stringify({id, method, params})); });
async function evaluate(expression) {
  const result = await send("Runtime.evaluate", {expression, awaitPromise: true, returnByValue: true});
  if (result.exceptionDetails) throw new Error(`Page script failed: ${result.exceptionDetails.exception?.description || result.exceptionDetails.text}`);
  return result.result.value;
}
const until = async (expression, label, tries = 100) => { for (let i = 0; i < tries; i += 1) { if (await evaluate(expression)) return; await sleep(200); } throw new Error(`Timed out: ${label}`); };
const click = (selector) => evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) throw new Error("missing ${selector.replaceAll('"', "'")}"); el.click(); return true; })()`);
const settle = () => evaluate("new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 150))))");
const found = new Map();
async function collect(label) {
  await settle();
  const missing = await evaluate("window.TidewayBangla.missing()");
  for (const key of missing) { if (!found.has(key)) found.set(key, new Set()); found.get(key).add(label); }
  console.log(`${label.padEnd(34)} ${missing.length} untranslated`);
  if (SHOTS) {
    mkdirSync(SHOTS, {recursive: true});
    const {data} = await send("Page.captureScreenshot", {format: "png"});
    writeFileSync(join(SHOTS, `${String(found.size).padStart(4, "0")}-${label.replace(/[^a-z0-9]+/gi, "-")}.png`), Buffer.from(data, "base64"));
  }
}
async function loginAs(id, pin) {
  await evaluate(`(async () => { const c = await (await fetch('/api/config')).json();
    await fetch('/api/session/logout', {method: 'POST', headers: {'Content-Type': 'application/json', 'X-Tideway-Token': c.csrf_token}, body: '{}'});
    const r = await fetch('/api/session/login', {method: 'POST', headers: {'Content-Type': 'application/json', 'X-Tideway-Token': c.csrf_token}, body: JSON.stringify({operator_id: '${id}', pin: '${pin}'})});
    if (!r.ok) throw new Error('login failed'); return true; })()`);
  await send("Page.reload");
  await until("document.readyState === 'complete' && typeof state !== 'undefined' && !!state.dashboard && !!document.querySelector('#view .metric')", `signed in as ${id}`);
}
async function view(name, ready = "true") {
  // Pages not in the sidebar are opened from the "All tools" directory, as a user would.
  if (await evaluate(`!!document.querySelector('.nav-item[data-view="${name}"]')`)) await click(`.nav-item[data-view="${name}"]`);
  else {
    await click('.nav-item[data-view="tools"]'); await until("state.view === 'tools'", "all tools");
    await click(`.tool-link[data-view="${name}"]`);
  }
  await until(`state.view === '${name}' && !state.busy && (${ready})`, `view ${name}`);
}
async function business(id) {
  await evaluate(`(() => { const s = document.querySelector('#business-select'); s.value = '${id}'; s.dispatchEvent(new Event('change', {bubbles: true})); return true; })()`);
  await until(`state.businessId === '${id}' && !state.busy && !!state.dashboard`, `business ${id}`);
}
async function eachTab(label, selector) {
  const count = await evaluate(`document.querySelectorAll('${selector}').length`);
  for (let i = 0; i < count; i += 1) {
    await evaluate(`document.querySelectorAll('${selector}')[${i}].click(), true`);
    await sleep(900);
    await until("!state.busy", `${label} tab ${i}`);
    await collect(`${label} · tab ${i + 1}`);
  }
}

let exitCode = 0;
try {
  await waitFor(`http://127.0.0.1:${PORT}/api/config`);
  await waitFor(`http://127.0.0.1:${DEBUG_PORT}/json/version`);
  const target = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/new?http://127.0.0.1:${PORT}/`, {method: "PUT"})).json();
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  socket.onmessage = (event) => {
    const m = JSON.parse(event.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(`${p.method}: ${m.error.message}`)) : p.resolve(m.result); }
    else if (m.method === "Runtime.exceptionThrown") errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  };
  await send("Page.enable"); await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", {width: 1440, height: 900, deviceScaleFactor: 1, mobile: false});
  await send("Page.navigate", {url: `http://127.0.0.1:${PORT}/`});
  await until("document.readyState === 'complete' && !document.querySelector('#login').hidden && document.querySelectorAll('[data-action=demo-login]').length === 3", "landing");
  await click('.land-top [data-action="lang"][data-lang="bn"]');
  await until("state.lang === 'bn' && document.documentElement.lang === 'bn'", "Bangla on landing");
  await collect("landing");

  await loginAs("nadia", "2468");
  await view("home"); await collect("home");
  await view("overview", "!!document.querySelector('.owner-view')"); await collect("forecast (simple)");
  await click("[data-action=owner-detailed]"); await until("!!document.querySelector('.brief')", "detailed"); await collect("forecast (detailed)");
  await click("[data-action=owner-simple]").catch(() => {});
  await view("rescue"); await collect("rescue (before)");
  await click('[data-action="run-agent"]'); await until("!!document.querySelector('.timeline') && !!document.querySelector('[data-action=approve]') && !state.busy", "agent run", 200);
  await collect("rescue (plan)");
  await click('[data-action="approve"]'); await until("document.querySelector('#approve-dialog').open", "approve dialog"); await collect("approve dialog");
  await evaluate("document.querySelector('#approve-dialog').close(), true");
  // The rest of the money flow in Bangla: two approvals -> signed mandate -> counterparty replies -> one execution -> receipt.
  const approveAs = async (id, pin) => {
    await loginAs(id, pin);
    await evaluate(`(async () => { const plan = state.dashboard.plan; const bundle = plan.bundles.find((b) => b.feasible);
      const ack = bundle.probability_breach_after > plan.risk_target ? {risk_acknowledgement: {acknowledged: true, plan_id: plan.plan_id,
        plan_hash: plan.plan_hash, bundle_id: bundle.bundle_id, probability_breach_after: bundle.probability_breach_after, risk_target: plan.risk_target}} : {};
      const r = await fetch('/api/plan/approve', {method: 'POST', headers: {'Content-Type': 'application/json', 'X-Tideway-Token': state.config.csrf_token},
        body: JSON.stringify({business_id: state.businessId, plan_id: plan.plan_id, bundle_id: bundle.bundle_id, pin: '${pin}',
          confirm_amount_minor: bundle.exposure_minor, review_ms: 9000, ...ack})});
      const answer = await r.json(); if (!r.ok) throw new Error(answer.error); return answer.status; })()`).then((status) => console.log(`approved as ${id}: ${status}`));
    await evaluate("loadDashboard().then(() => true)");
  };
  await approveAs("imran", "1357"); await view("rescue"); await collect("rescue (one approval)");
  await approveAs("nadia", "2468"); await view("rescue", "!!document.querySelector('[data-action=negotiate]')"); await collect("rescue (signed mandate)");
  await click('[data-action="negotiate"]'); await until("!!document.querySelector('[data-action=execute]') && !state.busy", "counterparties replied", 200);
  await collect("rescue (replies)");
  await click('[data-action="execute"]'); await until("!!document.querySelector('.receipt') && !state.busy", "receipt", 200);
  await collect("rescue (receipt)");
  await view("shield"); await collect("scam check (empty)");
  await view("assistant"); await collect("assistant");
  await view("shield"); await click('[data-action="shield-sample"][data-sample="fakeCashIn"]'); await until("!!document.querySelector('.shield-result')", "shield result"); await collect("scam check (result)");
  await view("learn"); await evaluate("localStorage.removeItem('tideway:lessons:' + state.operator.id), true");
  await click('[data-action="learn-answer"][data-id="safety"][data-i="0"]'); await sleep(300); await collect("money lessons (wrong answer)");
  await click('[data-action="learn-answer"][data-id="safety"][data-i="1"]'); await sleep(300); await collect("money lessons (right answer)");
  await view("inbox"); await click('[data-action="inbox-sample"][data-sample="injection"]'); await evaluate("document.querySelector('#inbox-form').requestSubmit(), true");
  await until("!state.busy && !!document.querySelector('#inbox-results .alert, #inbox-results .draft')", "inbox drafts", 200); await collect("inbox (drafts)");
  await view("whatif"); await evaluate("document.querySelector('#whatif-form').requestSubmit(), true"); await until("!state.busy", "what-if"); await sleep(600); await collect("what-if (result)");
  await view("records"); await collect("records");
  await view("team", "!!document.querySelector('.member-list')"); await collect("team");
  await view("lab"); await eachTab("decision lab", ".lab-tabs [data-action=lab-tab]");
  await view("treasury"); await eachTab("bank reports", ".lab-tabs [data-action=treasury-tab]");
  await view("portfolio", "!!document.querySelector('.pf table')"); await collect("lender radar");
  await view("security"); await click('[data-action="selftest"]'); await until("!!document.querySelector('.scorecard')", "self-test", 300); await collect("safety (self-test)");
  await view("evidence"); await click('[data-action="drill"]').catch(() => {}); await sleep(1200); await collect("audit trail (drill)");
  await click('[data-help-tool="tour"]').catch(() => {}); await sleep(500); await collect("help tour"); await click('[data-tour="end"]').catch(() => {});

  await business("harbourline-traders");
  await view("home"); await collect("home (fraud warnings)");
  await view("rescue"); await click('[data-action="run-agent"]'); await until("!!document.querySelector('.timeline') && !state.busy", "agent (no safe plan)", 200); await collect("rescue (no safe plan)");
  await view("security"); await collect("safety (payee alerts)");

  await loginAs("guest", "0000");
  await view("home"); await collect("viewer home");
  await view("rescue"); await collect("viewer rescue");

  if (errors.length) throw new Error(`Page errors: ${errors.join(" | ")}`);
  const list = [...found.entries()].map(([key, pages]) => ({key, pages: [...pages]})).sort((a, b) => a.key.localeCompare(b.key));
  if (OUT) writeFileSync(OUT, JSON.stringify(list, null, 1), "utf8");
  console.log(`\nUntranslated interface strings: ${list.length}`);
  if (STRICT && list.length) { console.log(list.slice(0, 40).map((x) => ` - ${x.key}  [${x.pages[0]}]`).join("\n")); exitCode = 1; }
  else if (!list.length) console.log("Bangla coverage check passed: every visited page is fully in বাংলা.");
} catch (error) {
  console.error(error.message); exitCode = 1;
} finally {
  try { socket?.close(); } catch (_) { /* closing */ }
  chrome.kill(); server.kill();
  process.exit(exitCode);
}
