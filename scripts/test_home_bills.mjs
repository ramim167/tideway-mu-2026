// Render the production Home view with imported and partially deferred bills.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const bills = [
  {id:'rent',status:'open',payee:'Rent',due_date:'2026-11-01',amount_minor:900},
  {id:'stock',status:'rescheduled',payee:'Stock',due_date:'2026-10-01',rescheduled_date:'2026-11-28',amount_minor:800},
  {id:'paid',status:'paid',payee:'Settled bill',due_date:'2026-10-02',amount_minor:100},
];
const dashboard = {records:{bills},state:{current_date:'2026-11-20',adjustments:[
  {kind:'bill_deferral',bill_id:'rent',amount_minor:400,to_date:'2026-11-30'}]}};
const context = {window:{},state:{dashboard,lang:'en'},day:String,esc:String,money:String,icon:()=>'',
  isNum:Number.isFinite,canApprove:()=>false};
vm.runInNewContext(readFileSync(new URL('../web/home.js',import.meta.url),'utf8'),context);
const html = context.window.TidewayHome.render();
assert.match(html,/Overdue since 2026-11-01[\s\S]*?home-amount">500</);
assert.match(html,/Due 2026-11-28[\s\S]*?home-amount">800</);
assert.match(html,/Due 2026-11-30[\s\S]*?home-amount">400</);
assert.doesNotMatch(html,/2026-10-01|Settled bill|No unpaid bills/);
