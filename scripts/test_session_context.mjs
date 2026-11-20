// Exercise account/workspace transitions and consent through the production handlers.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const events = {}, problems = [], sent = [];
const window = {scrollTo() {}};
for (const name of ['Lab','Home','Learn','Owner','Portfolio','Treasury']) {
  window['Tideway'+name] = {bind() {},reset() {}};
}
const context = vm.createContext({window, problems, sent,
  localStorage:{getItem:key=>key==='tideway:ai'?'1':null},
  fetch:()=>new Promise(()=>{}), // Keep the application bootstrap pending.
  document:{getElementById:()=>null,querySelectorAll:()=>[],addEventListener:(name,fn)=>(events[name]??=[]).push(fn)}});
const run = code=>vm.runInContext(code, context);
for (const file of ['shield','app']) {
  run(readFileSync(new URL('../web/'+file+'.js',import.meta.url),'utf8'));
}
run(`state.config={ai_configured:true,businesses:[]};
  state.operator={id:'owner'}; state.businessId='alpha';
  render=syncContextControls=clearError=startShell=()=>{};
  showError=error=>problems.push(error.message);
  act=async(label,work)=>work();
  api=async(path,body)=>{ if(path==='/api/chat'){sent.push(body);return {text:'OK'};}return {target_date:'2026-11-30'}; };
`);
assert.equal(run('state.aiConsent'),false);
await run(`setAi(true); ask('first question')`);
await run(`ask('second question')`);
assert.deepEqual(sent.map(body=>body.consent),[true,false]);

function privateDraft() {
  for (const handler of events.input.slice(0,1)) handler({target:{id:'shield-text',value:'sensitive reference'}});
  run(`state.recordQuery='private customer'; state.recordFilter='bill'; setAi(true)`);
  assert.match(run('window.TidewayShield.render()'),/sensitive reference/);
}
function verifyCleared() {
  assert.doesNotMatch(run('window.TidewayShield.render()'),/sensitive reference/);
  assert.equal(run('state.recordQuery'),'');
  assert.equal(run('state.recordFilter'),'all');
  assert.equal(run('state.aiConsent'),false);
}
privateDraft();
await run("loadDashboard({businessId:'beta'})");
verifyCleared();
privateDraft();
await run("enterAs({operator:{id:'accountant'}})");
verifyCleared();

run("api=async()=>{throw new Error('Network unavailable')}; showLogin=()=>{throw new Error('False sign-out')}");
await run("logout()");
assert.equal(run('state.operator.id'),'accountant');
assert.match(problems.at(-1),/Retry/);
console.log('Account switch, workspace switch, single-send consent and failed logout passed.');

run(`state.inbox=freshInbox(); state.inbox.text='  exact checked message  ';
  api=async()=>({drafts:[],scam_shield:{verdict:'likely_scam',signals:[],actions:[],claims:{},model:{}}});`);
await run("extractInbox()");
assert.match(run("inboxResultsHtml()"),/data-action="inbox-shield"/);
run("state.inbox.text='different draft'");
const button = run(`globalThis.Element=class {closest(s){return s==="[data-action]"?this:null;}};
  Object.assign(new Element(),{dataset:{action:'inbox-shield'}})`);
await events.click.at(-1)({target:button});
assert.equal(run("state.view"),"shield");
assert.match(run("window.TidewayShield.render()"),/exact checked message/);
assert.match(run("window.TidewayShield.render()"),/Likely scam/);
assert.doesNotMatch(run("window.TidewayShield.render()"),/different draft/);

run(`state.config.vision={max_upload_bytes:3};
  globalThis.URL={createObjectURL:()=>'blob:test',revokeObjectURL:()=>{}};
  globalThis.Image=class {width=2;height=2;set src(value){this.onload();}};
  globalThis.encoded='AAAA';
  document.createElement=()=>({getContext:()=>({drawImage(){}}),toDataURL:()=>'data:image/jpeg;base64,'+encoded});`);
assert.match(await run("shrinkPhoto({type:'image/jpeg',size:5})"),/AAAA$/);
run("encoded='AAAAAA=='");
await assert.rejects(run("shrinkPhoto({type:'image/jpeg',size:5})"),/exceeds/);
