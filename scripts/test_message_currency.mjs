// Recipient messages must retain agreed ledger units even when dashboard amounts are converted.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const app=readFileSync(new URL('../web/app.js',import.meta.url),'utf8');
const money=readFileSync(new URL('../web/currency.js',import.meta.url),'utf8');
const esc=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const context={state:{lang:'en',displayCurrency:'USD',dashboard:{business:{currency:'BDT',name:'Shop'},records:{}}},
  isNum:Number.isFinite,esc,icon:()=>''};
vm.createContext(context);
vm.runInContext(money,context);
context.TidewayMoney.configure({USD:1,BDT:122,CNY:7.1});
vm.runInContext('const currency=()=>state.dashboard.business.currency;'
  +app.slice(app.indexOf('function money(minor'),app.indexOf('function localizeMoneyText'))
  +app.slice(app.indexOf('const BN_DIGITS ='),app.indexOf('function actionCard'))
  +';globalThis.renderMessage=messageHtml;',context);

for(const base of ['BDT','CNY','USD'])for(const shown of ['BDT','CNY','USD'])for(const lang of ['en','bn']){
  context.state.lang=lang;context.state.displayCurrency=shown;context.state.dashboard.business.currency=base;
  const item={type:'supplier_deferral',currency:base,amount_minor:6000000,record_id:'bill-123',counterparty:'Supplier',
    from_date:'2026-10-31',to_date:'2026-11-14',message:`Please defer ${base} 60,000 to 14 November.`};
  const html=context.renderMessage(item), copied=html.match(/data-text="([^"]*)"/)[1];
  assert.doesNotMatch(copied,/≈/);
  assert.match(copied,lang==='bn'&&base==='BDT'?/৬০,০০০ টাকা/:new RegExp(`${base} 60,000`));
  if(lang==='en')assert.equal(copied,item.message);
  assert.match(html,/data-currency-original/); // The global text conversion pass must skip these terms.
}
console.log('Recipient message checks passed: original ledger currency in English and Bangla across 18 currency/language combinations.');
