// Exercise real Shield event handlers with controlled requests; no browser or packages needed.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../web/shield.js', import.meta.url), 'utf8');
const safe = {verdict:'no_red_flags',risk_score:0,signals:[],actions:[],claims:{},model:{}};
const dangerous = {...safe,verdict:'likely_scam',risk_score:70};
function setup() {
  const listeners = {}, host = {innerHTML:''}, fields = {}, pending = [];
  const context = {window:{},state:{lang:'en'},esc:value=>String(value??''),icon:()=>'',isNum:Number.isFinite,
    document:{addEventListener:(name,fn)=>{listeners[name]=fn;},getElementById:id=>id==='shield-result'?host:fields[id]},
    toast:()=>{},api:(_url,payload)=>new Promise((resolve,reject)=>pending.push({payload,resolve,reject})),
    act:async(_label,work)=>{try{return await work();}catch{return null;}}};
  vm.runInNewContext(source, context);
  const ui = context.window.TidewayShield;
  ui.bind(()=>{host.innerHTML=ui.render();});
  const input = (id,value)=>listeners.input({target:{id,value}});
  const submit = ()=>listeners.submit({target:{id:'shield-form'},preventDefault(){}});
  return {ui,input,host,pending,submit,fields};
}
const settle = async()=>{for(let i=0;i<8;i++) await Promise.resolve();};

{
  const {ui,input,host,pending}=setup();
  const first=ui.action('sample',{sample:'genuine'});
  pending.shift().resolve(safe); await first;
  assert.match(ui.render(),/No known red flags/);
  input('shield-text','Send your PIN and OTP immediately.');
  assert.doesNotMatch(ui.render(),/No known red flags/);
  assert.doesNotMatch(host.innerHTML,/No known red flags/);
  const failed=ui.action('sample',{sample:'pin'});
  pending.shift().reject(new Error('HTTP 429')); await failed;
  assert.match(ui.render(),/Could not check/);
  assert.doesNotMatch(ui.render(),/No known red flags/);
  assert.match(ui.resultHtml(safe),/No known red flags/); // Embedded Inbox results have their own state.
}
{
  const {ui,input,pending}=setup();
  const request=ui.action('sample',{sample:'genuine'});
  input('shield-sender','01788888888');
  pending.shift().resolve(safe); await request;
  assert.doesNotMatch(ui.render(),/No known red flags/);
}
{
  const {ui,pending}=setup();
  const old=ui.action('sample',{sample:'genuine'});
  const current=ui.action('sample',{sample:'pin'});
  pending[1].resolve(dangerous); await current;
  pending[0].resolve(safe); await old;
  assert.match(ui.render(),/Likely scam/);
  assert.doesNotMatch(ui.render(),/No known red flags/);
}
{
  const {ui,pending}=setup();
  const request=ui.action('sample',{sample:'genuine'});
  await ui.action('clear',{});
  pending[0].resolve(safe); await request;
  assert.doesNotMatch(ui.render(),/No known red flags/);
}
{
  const {ui,pending}=setup();
  const request=ui.action('sample',{sample:'genuine'});
  pending[0].reject(new Error('Offline')); await request;
  const retry=ui.action('sample',{sample:'pin'});
  pending[1].resolve(dangerous); await retry; await settle();
  assert.match(ui.render(),/Likely scam/);
  assert.doesNotMatch(ui.render(),/Could not check/);
}
{
  const {ui,fields,pending,submit}=setup();
  // Browser autofill can update the visible form without dispatching input.
  fields['shield-text']={value:'First visible text'};
  fields['shield-sender']={value:'Sender one'};
  submit();
  assert.equal(pending[0].payload.text,'First visible text');
  assert.equal(pending[0].payload.sender,'Sender one');
  fields['shield-sender'].value='Sender two';
  pending[0].resolve(safe); await settle();
  assert.doesNotMatch(ui.render(),/No known red flags/);
  submit();
  assert.equal(pending[1].payload.sender,'Sender two');
  pending[1].resolve(dangerous); await settle();
  assert.match(ui.render(),/Likely scam/);
  fields['shield-text'].value='';
  submit();
  assert.doesNotMatch(ui.render(),/Likely scam/);
}
console.log('Scam Shield checks passed: edits, failed checks, retry, clearing and out-of-order responses.');
