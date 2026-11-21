"use strict";

// First-use guidance stays separate from the financial UI. Its controls only
// navigate to existing views; approval and execution keep their normal forms.
window.TidewayQuickStart = (() => {
  const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c]));
  const memory = new Map();
  let contextKey = "";
  let context = null;

  function collapsed(key) {
    if (memory.has(key)) return memory.get(key);
    try { return localStorage.getItem(key) !== "expanded"; }
    catch { return true; }
  }

  function render(next) {
    const host = document.getElementById("quick-start");
    if (!host) return;
    context = next;
    if (!next?.businessId || !next?.operatorId || !["overview", "rescue", "evidence"].includes(next.view)) {
      host.hidden = true;
      return;
    }
    contextKey = `tideway.quick-start.v1:${encodeURIComponent(next.operatorId)}:${encodeURIComponent(next.businessId)}`;
    const isCollapsed = collapsed(contextKey);
    const viewer = !["owner", "accountant"].includes(next.role);
    const steps = [
      {id: "forecast", view: "overview", title: "Check your cash forecast", label: "Open cash forecast",
        text: next.hasRecords ? "Start with the target date, reserve and expected collections. Projections are estimates." : "Your forecast currently starts with opening cash. Add invoices and bills using the getting-started card below."},
      {id: "rescue", view: "rescue", title: viewer ? "Inspect a rescue plan" : "Find a rescue plan", label: "Find a fix",
        text: viewer ? "Review an existing proposal. An owner or accountant can ask Tideway to create one." : "Ask Tideway for options, then compare dates, fees and remaining risk before choosing."},
      {id: "review", view: "rescue", title: viewer ? "Know who can approve" : "Review before approving", label: "Review the workflow",
        text: viewer ? "You have read-only access. An owner or accountant must approve with their own PIN; larger actions need two people." : "Read the exact terms and use your own PIN. Larger actions need two people. Execution is a separate action after agreement."},
      {id: "evidence", view: "evidence", title: "Check what happened", label: "Open audit trail",
        text: "Inspect the audit trail and receipts. Read-back confirms what changed after execution."},
    ];
    const active = next.view === "overview" ? "forecast" : next.view === "evidence" ? "evidence"
      : next.view === "rescue" ? (next.hasProposal ? "review" : "rescue") : "";
    host.hidden = false;
    host.innerHTML = `<button type="button" class="guidance-toggle" data-quick-start-toggle aria-expanded="${!isCollapsed}" aria-controls="quick-start-steps">Quick start</button>
      <div id="quick-start-steps" class="guidance-body" ${isCollapsed ? "hidden" : ""}><h2>Your first cash-flow review</h2><p>${next.synthetic ? "This demo uses fictional records." : "Start with your business records."} No real money moves.</p>
      <ol class="quick-start-steps">${steps.map((step, index) => `<li${active === step.id ? ' class="current"' : ""}><span class="quick-start-number" aria-hidden="true">${index + 1}</span><div><h3>${escape(step.title)}</h3><p>${escape(step.text)}</p><button type="button" class="button small ghost" data-view="${step.view}" data-quick-start-link${active === step.id ? ' aria-current="step"' : ""}>${escape(step.label)}</button></div></li>`).join("")}</ol>
      <p class="quick-start-help">These shortcuts open pages; they never approve or execute a plan.</p></div>`;
  }

  document.addEventListener("click", (event) => {
    const button = event.target instanceof Element ? event.target.closest("[data-quick-start-toggle]") : null;
    if (!button || !contextKey || !context) return;
    const isCollapsed = !collapsed(contextKey);
    memory.set(contextKey, isCollapsed);
    try { localStorage.setItem(contextKey, isCollapsed ? "collapsed" : "expanded"); } catch { /* in-memory preference is sufficient */ }
    render(context);
    document.querySelector("[data-quick-start-toggle]")?.focus({preventScroll: true});
  });

  return Object.freeze({render});
})();
