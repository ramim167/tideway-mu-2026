// Source-aware assertions shared by the browser story and its small regression suite.
import assert from 'node:assert/strict';

export function assertHomePayrollAnswer(reply, dashboard) {
  assert.equal(reply?.role, 'agent', 'Home question needs an assistant answer');
  assert.ok(!reply.pending && !reply.rejected, 'Home answer must finish without a rejected plan');
  assert.match(reply.text || '', /payroll.*(?:at risk|not fully funded)/i, 'Home answer must explain the payroll shortfall');
  assert.equal(dashboard?.owner_view?.status, 'payroll_unfunded', 'The Home payroll fixture must still be unfunded');
  if (reply.copilot) {
    assert.equal(reply.copilot.model_called, true, 'Configured local backend must actually be called');
    const projection = reply.copilot.results?.find(item => item.tool === 'project_cash')?.result;
    assert.ok(projection, 'Model-backed Home answer needs a cash projection');
    assert.equal(projection.payroll_at_risk, true, 'Model-backed answer must observe the payroll risk');
    const expected = dashboard.projections?.[projection.scenario];
    assert.ok(expected, 'Projection must use a known dashboard scenario');
    assert.ok(Number.isSafeInteger(projection.minimum_cash_minor), 'Projection must contain an exact cash amount');
    for (const field of ['minimum_cash_minor', 'minimum_cash_date', 'reserve_shortfall_minor']) {
      assert.equal(projection[field], expected[field], `Home answer ${field} must match the dashboard`);
    }
  } else {
    const tools = new Set((reply.trace || []).map(item => item.tool));
    assert.ok(tools.has('project_cash') && tools.has('simulate_risk'), 'Fallback answer must inspect cash and payroll risk');
  }
}
