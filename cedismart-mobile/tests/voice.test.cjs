const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function loadTS(file, mocks = {}, extraGlobals = {}) {
  const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(output, {
    exports,
    require: (name) => {
      if (!(name in mocks)) throw new Error(`Unexpected dependency: ${name}`);
      return mocks[name];
    },
    setTimeout, clearTimeout, setInterval, clearInterval, ...extraGlobals,
  }, { filename: file });
  return exports;
}

const { SpeechDetector, recognitionError } = loadTS('src/services/voiceSession.ts');

test('quiet speech is submitted only after a full pause', () => {
  const detector = new SpeechDetector();
  for (let t = 100; t <= 1200; t += 100) assert.equal(detector.update(t, -55).shouldSend, false);
  for (let t = 1300; t < 2200; t += 100) assert.equal(detector.update(t, -80).shouldSend, false);
  assert.equal(detector.update(2200, -80).shouldSend, true);
});

test('short pauses and quieter trailing syllables do not cut off a sentence', () => {
  const detector = new SpeechDetector();
  for (let t = 100; t <= 1000; t += 100) detector.update(t, -50);
  for (let t = 1100; t <= 1600; t += 100) assert.equal(detector.update(t, -80).shouldSend, false);
  for (let t = 1700; t <= 2300; t += 100) assert.equal(detector.update(t, -60).shouldSend, false);
  assert.equal(detector.update(2800, -80).shouldSend, false);
  assert.equal(detector.update(3300, -80).shouldSend, true);
});

test('silence and a single click do not send a recording', () => {
  const detector = new SpeechDetector();
  for (let t = 100; t <= 30000; t += 100) {
    const result = detector.update(t, t === 1000 ? -25 : -90);
    assert.equal(result.shouldSend, false);
    assert.equal(result.timedOut, t === 30000);
  }
});

test('missing metering is visible and never masquerades as an end of speech', () => {
  const detector = new SpeechDetector();
  detector.update(100, -45);
  detector.update(200, -45);
  for (let t = 300; t <= 3000; t += 100) assert.equal(detector.update(t).shouldSend, false);
  assert.equal(detector.update(3100, NaN).meteringUnavailable, true);
  assert.equal(detector.update(3200, -80).shouldSend, false);
});

test('continuous speech is bounded and a new detector starts cleanly', () => {
  const detector = new SpeechDetector();
  for (let t = 100; t < 45000; t += 100) assert.equal(detector.update(t, -30).shouldSend, false);
  assert.equal(detector.update(45000, -30).shouldSend, true);
  assert.equal(new SpeechDetector().update(1000, -90).shouldSend, false);
});

test('duplicate timestamps cannot promote a click into speech', () => {
  const detector = new SpeechDetector();
  detector.update(100, -30);
  detector.update(100, -30);
  assert.equal(detector.update(2000, -90).shouldSend, false);
});

test('legacy and new recognition failures are explicit; actual silence is distinct', () => {
  assert.ok(recognitionError({ transcript: 'Voice note received' }));
  assert.ok(recognitionError({ error_code: 'recognition_unavailable', transcript: '' }));
  assert.equal(recognitionError({ transcript: '' }), null);
  assert.equal(recognitionError({ transcript: 'What is my balance?' }), null);
});

function playbackHarness(write = async () => {}) {
  const players = [], deleted = [], timers = new Map();
  let timerId = 0, now = 0;
  const service = loadTS('src/services/voiceService.ts', {
    'expo-audio': { setAudioModeAsync: async () => {}, createAudioPlayer: () => {
      const player = { removed: false, play() {}, remove() { this.removed = true; },
        addListener(name, callback) { this.callback = callback; return { remove() {} }; },
        emit(status) { this.callback(status); },
      };
      players.push(player);
      return player;
    } },
    'expo-file-system/legacy': {
      cacheDirectory: 'cache/', EncodingType: { Base64: 'base64' },
      writeAsStringAsync: write, deleteAsync: async (file) => { deleted.push(file); },
    },
  }, {
    Date: { now: () => now },
    setTimeout: (fn) => { timers.set(++timerId, fn); return timerId; },
    clearTimeout: (id) => timers.delete(id),
    setInterval: (fn) => { timers.set(++timerId, fn); return timerId; },
    clearInterval: (id) => timers.delete(id),
  }).voiceService;
  return { service, players, deleted, tick: (time) => { now = time; [...timers.values()].forEach(fn => fn()); } };
}

test('successful neural playback finishes once and releases resources', async () => {
  const h = playbackHarness();
  let started = 0, done = 0, failed = 0;
  await h.service.speakNeural('audio', () => started++, () => done++, () => failed++);
  h.players[0].emit({ playing: true, currentTime: 0.2, duration: 1 });
  h.players[0].emit({ playing: false, currentTime: 1, duration: 1, didJustFinish: true });
  h.players[0].emit({ didJustFinish: true });
  assert.equal(started, 1); assert.equal(done, 1); assert.equal(failed, 0);
  assert.equal(h.players[0].removed, true); assert.equal(h.deleted.length, 1);
});

test('playback error is reported without importing or calling device speech', async () => {
  const h = playbackHarness(); let failed = 0;
  await h.service.speakNeural('audio', undefined, undefined, () => failed++);
  h.players[0].emit({ error: 'invalid audio' });
  assert.equal(failed, 1); assert.equal(h.players[0].removed, true);
});

test('interrupt during a pending file write never starts stale audio', async () => {
  let release; const pendingWrite = new Promise(resolve => { release = resolve; });
  const h = playbackHarness(() => pendingWrite); let done = 0;
  const speaking = h.service.speakNeural('audio', undefined, () => done++);
  await Promise.resolve(); await Promise.resolve();
  await h.service.stop(); release(); await speaking;
  assert.equal(h.players.length, 0); assert.equal(done, 0);
});

test('callbacks from interrupted audio cannot restart listening', async () => {
  const h = playbackHarness(); let done = 0;
  await h.service.speakNeural('first', undefined, () => done++);
  await h.service.stop();
  h.players[0].emit({ didJustFinish: true });
  assert.equal(done, 0);
  await h.service.speakNeural('second', undefined, () => done++);
  h.players[1].emit({ didJustFinish: true });
  assert.equal(done, 1);
});

test('audio that never starts or stalls produces a recoverable error', async () => {
  for (const started of [false, true]) {
    const h = playbackHarness(); let failed = 0;
    await h.service.speakNeural('audio', undefined, undefined, () => failed++);
    if (started) h.players[0].emit({ playing: true, currentTime: 0, duration: 10 });
    h.tick(16000);
    assert.equal(failed, 1); assert.equal(h.players[0].removed, true);
  }
});

test('room noise does not prevent automatic submission after speech', () => {
  const detector = new SpeechDetector();
  for (let t = 100; t <= 1000; t += 100) assert.equal(detector.update(t, -45).shouldSend, false);
  for (let t = 1100; t <= 2200; t += 100) detector.update(t, -24);
  let sent = false;
  for (let t = 2300; t <= 3400; t += 100) sent ||= detector.update(t, -45).shouldSend;
  assert.equal(sent, true, 'speech must send when the user pauses, even though the room is not silent');
});
