import assert from "node:assert/strict";

// Exercise the real composer handlers without recording audio or using a speech service.
export const testSpeechRecognition = `window.SpeechRecognition = class {
  start() { window.testRecognition = this; }
  stop() { this.onend?.(); }
  abort() { this.aborted = true; this.onend?.(); }
  speak(...parts) { this.onresult({results: parts.map(transcript => [{transcript}])}); }
}`;

export async function checkChatComposer({evaluate, click, viewport, shot, phoneCheck, send}) {
  const mic = '[data-action="voice"]';
  const setDraft = (text) => evaluate(`(() => {
    const box = document.getElementById('chat-input');
    box.value = ${JSON.stringify(text)};
    box.dispatchEvent(new Event('input', {bubbles: true}));
  })()`);
  const value = () => evaluate("document.getElementById('chat-input').value");
  const dimensions = () => evaluate(`(() => {
    const box = document.getElementById('chat-input');
    return {height: box.clientHeight, scroll: box.scrollHeight, tag: box.tagName};
  })()`);
  const short = await dimensions();
  const fullText = "Please explain when salary money runs short and how the business could cover it. ".repeat(5).trim();
  await setDraft(fullText);
  const desktop = await dimensions();
  assert.equal(desktop.tag, "TEXTAREA");
  assert.ok(desktop.height > short.height && desktop.height >= desktop.scroll - 1, "Desktop draft should grow to show wrapped lines");
  await viewport(375, 812, true);
  const mobile = await dimensions();
  assert.ok(mobile.height > desktop.height && mobile.height >= mobile.scroll - 1, "Phone draft should wrap at the full composer width");
  await phoneCheck("Chat composer", "#chat-form");
  await evaluate("document.getElementById('chat-form').scrollIntoView({block: 'center'})");
  await shot("07-composer-mobile", false);
  await viewport(1440, 900);

  await setDraft("My existing question.");
  await click(mic);
  assert.equal(await value(), "My existing question.", "Starting the microphone keeps the draft");
  await evaluate("window.testRecognition.speak('Check cash')");
  await evaluate("window.testRecognition.speak('Check salaries', ' and reserves')");
  assert.equal(await value(), "My existing question. Check salaries and reserves");
  await click(mic);
  await click('.topbar [data-action="lang"][data-lang="bn"]');
  await click(mic);
  assert.equal(await evaluate("window.testRecognition.lang"), "bn-BD");
  await evaluate("window.testRecognition.speak('বেতনের ঝুঁকিও দেখান।')");
  assert.equal(await value(), "My existing question. Check salaries and reserves বেতনের ঝুঁকিও দেখান।");

  // Manual edits win over late messages from a cancelled speech session.
  await setDraft("Edited draft");
  assert.equal(await evaluate("window.testRecognition.aborted"), true);
  await evaluate("window.testRecognition.speak('discard late result')");
  assert.equal(await value(), "Edited draft");
  await click(mic);
  await evaluate("window.testRecognition.onerror({error:'no-speech'})");
  assert.equal(await value(), "Edited draft", "Speech errors leave the draft available");
  await click('.topbar [data-action="lang"][data-lang="en"]');

  // Real keyboard input keeps Shift+Enter as a newline and Enter as form submission.
  await evaluate(`(() => {
    const box = document.getElementById('chat-input');
    box.focus();
    box.setSelectionRange(box.value.length, box.value.length);
    box.form.addEventListener('submit', event => {
      event.preventDefault();
      event.stopPropagation();
      window.testComposerSubmitted = box.value;
    }, {once: true});
  })()`);
  const enter = async (modifiers) => {
    const key = {key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, modifiers};
    await send("Input.dispatchKeyEvent", {type: "keyDown", ...key, text: "\r"});
    await send("Input.dispatchKeyEvent", {type: "keyUp", ...key});
  };
  await enter(8);
  assert.equal(await value(), "Edited draft\n");
  assert.equal(await evaluate("window.testComposerSubmitted"), undefined);
  await enter(0);
  assert.equal(await evaluate("window.testComposerSubmitted"), "Edited draft\n");
  await setDraft("");
}
