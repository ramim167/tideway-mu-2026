import assert from 'node:assert/strict';
import {assertHomePayrollAnswer} from './browser_assertions.mjs';

const forecast = {minimum_cash_minor:-4200000,minimum_cash_date:'2026-11-03',reserve_shortfall_minor:6200000};
const dashboard = {owner_view:{status:'payroll_unfunded'},projections:{likely:forecast}};
const fallback = {role:'agent',text:'Payroll is not fully funded on the schedule.',
  trace:[{tool:'project_cash'},{tool:'simulate_risk'}]};
const model = {role:'agent',text:'Likely view: lowest cash -BDT 42,000 on 3 Nov; reserve shortfall BDT 62,000; payroll is at risk.',
  copilot:{model_called:true,results:[{tool:'project_cash',result:{...forecast,scenario:'likely',payroll_at_risk:true}}]}};
assertHomePayrollAnswer(fallback,dashboard);
assertHomePayrollAnswer(model,dashboard);
for(const field of ['minimum_cash_minor','minimum_cash_date','reserve_shortfall_minor']) {
  const wrong=structuredClone(model);
  wrong.copilot.results[0].result[field]=field.endsWith('_date')?'2026-11-04':0;
  assert.throws(()=>assertHomePayrollAnswer(wrong,dashboard));
}
for(const invalid of [{...model,pending:true},{...model,rejected:true},{...model,text:''},
  {...model,copilot:{...model.copilot,model_called:false}},
  {...model,copilot:{...model.copilot,results:[]}},
  {...fallback,trace:[]}, {...fallback,text:'Payroll is fully funded.'}]) {
  assert.throws(()=>assertHomePayrollAnswer(invalid,dashboard));
}
assert.throws(()=>assertHomePayrollAnswer(model,{...dashboard,owner_view:{status:'likely_path_holds'}}));
console.log('Browser assertion checks passed: both assistant backends, matched financial facts and rejected invalid evidence.');
