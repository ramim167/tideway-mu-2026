// Exercise the production DOM translation pass, including collection of detached nodes.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

if (!global.gc) process.exit(spawnSync(process.execPath, ['--expose-gc', ...process.argv.slice(1)], {stdio:'inherit'}).status ?? 1);

class Element {
  nodeType = 1;
  constructor(tag, placeholder, text) {
    this.tag = tag;
    this.attributes = {placeholder};
    this.children = [];
    this.text = text ? {nodeType:3,nodeValue:text,parentElement:this} : null;
    this.value = text;
  }
  closest(selector) { return selector.split(',').includes(this.tag) ? this : null; }
  getAttribute(attr) { return this.attributes[attr]; }
  setAttribute(attr,value) { this.attributes[attr]=value; }
  querySelectorAll(selector) { return selector.startsWith('[') ? this.children : []; }
  querySelector() { return null; }
}
const body = new Element('body');
let notify;
const context = {window:{},Node:{TEXT_NODE:3,ELEMENT_NODE:1},NodeFilter:{SHOW_TEXT:4},
  document:{body,documentElement:{},createTreeWalker(root) {
    const nodes=[root,...root.children].map(el=>el.text).filter(Boolean);
    return {nextNode:()=>nodes.shift()};
  }},
  MutationObserver:class {constructor(cb){notify=cb;} observe(){} disconnect(){}}
};
for (const file of ['i18n-bn-dict','i18n-bn']) vm.runInNewContext(readFileSync(new URL('../web/'+file+'.js',import.meta.url),'utf8'),context);
const ui = context.window.TidewayBangla;
const placeholder = 'e.g. Invoice INV-2291 to Nila Traders, EUR 100, due 5 Nov';
for (const names of [[], ['Nila Traders']]) {
  ui.setNames(names);
  const inbox = new Element('textarea',placeholder,'Sample: invoice SMS');
  const shield = new Element('textarea','e.g. You have received Tk 5,000.00 from 017… Please send back by mistake…','Fake cash-in SMS');
  body.children=[inbox,shield];
  ui.setLang('bn');
  assert.match(inbox.getAttribute('placeholder'),/চালান.*EUR 100/);
  assert.match(shield.getAttribute('placeholder'),/টাকা/);
  assert.equal(shield.value,'Fake cash-in SMS');
  assert.equal(shield.text.nodeValue,'Fake cash-in SMS');
  body.children=[inbox];   // Reinsert after restoring English.
  ui.setLang('en');
  assert.equal(inbox.getAttribute('placeholder'),placeholder);
  body.children.push(shield);
  notify([{addedNodes:[shield]}]);
  assert.match(shield.getAttribute('placeholder'),/^e.g. You have received/);
}
function detach() {
  const heading=new Element('h3','Fake cash-in SMS','Fake cash-in SMS');
  body.children=[heading];
  ui.setLang('bn');
  assert.equal(heading.text.nodeValue,'ভুয়া ক্যাশ-ইন এসএমএস');
  const refs=[new WeakRef(heading),new WeakRef(heading.text)];
  body.children=[];
  return refs;
}
const detached = detach();
for (let i=0; i<4; i++) {await new Promise(setImmediate); global.gc();}
assert.ok(detached.every(ref=>ref.deref()===undefined));
