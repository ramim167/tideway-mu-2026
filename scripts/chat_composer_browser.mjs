import assert from "node:assert/strict";

// Exercise the real composer handlers without recording audio or using a speech service.
export const testSpeechRecognition = `window.SpeechRecognition = class {
  start() { window.testRecognition = this; this.onstart?.(); }
  stop() { this.stopped = true; }
  end() { this.onend?.(); }
  abort() { this.aborted = true; this.end(); }
  speak(...parts) { this.onresult({results: parts.map(transcript => [{transcript}])}); }
}`;

export async function checkChatComposer({evaluate, click, until, viewport, shot, phoneCheck, send}) {
  const mic = '[data-action="voice"]';
  const pause = '[data-action="voice-pause"]';
  const finish = '[data-action="voice-finish"]';
  const note = () => evaluate("document.getElementById('chat-voice-note').textContent");
  const clock = () => evaluate("document.getElementById('chat-voice-clock').textContent");
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
  assert.equal(await evaluate("window.testRecognition.continuous"), true);
  assert.equal(await note(), "Listening");
  await evaluate("window.testRecognition.onspeechstart()");
  assert.equal(await note(), "Hearing you");
  assert.equal(await evaluate("document.querySelector('.voice-panel').dataset.status"), "speaking");
  await send("Emulation.setEmulatedMedia", {features: [{name: "prefers-reduced-motion", value: "reduce"}]});
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.voice-wave i')).animationName"), "none");
  await send("Emulation.setEmulatedMedia", {features: []});
  await until("document.getElementById('chat-voice-clock').textContent !== '00:00'", "elapsed microphone time");
  await evaluate("window.testRecognition.onspeechend()");
  assert.equal(await note(), "Listening");
  await evaluate("window.testRecognition.speak('Check cash')");
  await evaluate("window.testRecognition.speak('Check salaries', ' and reserves')");
  assert.equal(await value(), "My existing question. Check salaries and reserves");
  await evaluate("window.previousRecognition = window.testRecognition; window.testRecognition.end()");
  await until("window.testRecognition !== window.previousRecognition", "dictation reconnects after a normal browser stop");
  assert.equal(await value(), "My existing question. Check salaries and reserves");
  await evaluate("window.testRecognition.onerror({error:'no-speech'}); window.previousRecognition = window.testRecognition; window.testRecognition.end()");
  await until("window.testRecognition !== window.previousRecognition", "dictation reconnects after silence");
  await evaluate("window.testRecognition.speak('Next question')");
  await click(pause);
  assert.equal(await evaluate("window.testRecognition.stopped"), true, "Pause stops the underlying microphone");
  assert.equal(await evaluate("voice.clock"), null, "Pause freezes the elapsed microphone time");
  await evaluate("window.testRecognition.speak('Next question.'); window.previousRecognition = window.testRecognition; window.testRecognition.end()");
  assert.match(await note(), /Paused/);
  const pausedClock = await clock();
  assert.equal(await evaluate("voice.timer"), null, "Pausing cancels automatic reconnect");
  assert.equal(await value(), "My existing question. Check salaries and reserves Next question.", "Pause keeps the last finalized words");

  await click('.topbar [data-action="lang"][data-lang="bn"]');
  await click(pause);
  assert.equal(await evaluate("window.testRecognition.lang"), "bn-BD");
  assert.notEqual(await clock(), "00:00", "Resume keeps the previous listening time");
  assert.ok((await clock()) >= pausedClock);
  await evaluate("window.testRecognition.speak('বেতনের ঝুঁকিও দেখান।')");
  await evaluate("window.testRecognition.onspeechstart()");
  assert.equal(await value(), "My existing question. Check salaries and reserves Next question. বেতনের ঝুঁকিও দেখান।");

  await viewport(375, 812, true);
  await phoneCheck("Dictation controls", "#chat-form");
  await evaluate("document.getElementById('chat-form').scrollIntoView({block: 'center'})");
  await shot("07-dictation-mobile", false);
  await viewport(1440, 900);

  await click(finish);
  assert.equal(await evaluate("window.testRecognition.stopped"), true);
  await evaluate("window.testRecognition.speak('বেতনের ঝুঁকিও দেখান।', 'ধন্যবাদ।'); window.testRecognition.end()");
  assert.equal(await value(), "My existing question. Check salaries and reserves Next question. বেতনের ঝুঁকিও দেখান। ধন্যবাদ।");
  assert.equal(await evaluate("voice"), null, "Finish ends the session without sending the draft");
  assert.equal(await evaluate("document.activeElement.id === 'chat-input' && document.activeElement.selectionStart === document.activeElement.value.length"), true);
  assert.match(await evaluate("document.getElementById('chat-voice-help').textContent"), /খসড়া তৈরি হয়েছে/);
  await click(mic);

  // Manual edits win over late messages from a cancelled speech session.
  await setDraft("Edited draft");
  assert.equal(await evaluate("window.testRecognition.aborted"), true);
  await evaluate("window.testRecognition.speak('discard late result')");
  assert.equal(await value(), "Edited draft");
  await click(pause);
  await evaluate("window.testRecognition.onerror({error:'not-allowed'}); window.testRecognition.end()");
  assert.equal(await value(), "Edited draft", "Speech errors leave the draft available");
  await click('.topbar [data-action="lang"][data-lang="en"]');
  assert.match(await note(), /Microphone access was refused/);
  assert.equal(await evaluate("voice.timer"), null, "Permission errors do not retry automatically");
  await click(pause);
  assert.equal(await evaluate(`(() => {
    window.testRecognition.end();
    const scheduled = voice.timer !== null;
    document.querySelector(${JSON.stringify(finish)}).click();
    return scheduled && voice === null;
  })()`), true, "Finish cancels a pending reconnect");

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
