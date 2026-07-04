/* USA 250 — Patriotic trivia sound effects (Web Audio API synthesis).
 * -------------------------------------------------------------
 * 8 CORRECT (fife-and-drum-corps style) + 8 WRONG (deflated brass /
 * muffled drum) sound effects, all synthesized live in-browser.
 * -------------------------------------------------------------
 */

let ctx = null;
let enabled = true;
let lastCorrectIdx = -1;
let lastWrongIdx = -1;

const MASTER = 0.55;

export function setEnabled(b) { enabled = !!b; }
export function getEnabled()   { return enabled; }
export function unlock() {
  const c = ensureCtx();
  if (c && c.state === "suspended") c.resume();
}

function ensureCtx() {
  if (!enabled) return null;
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

function shape(c, gainNode, { attack = 0.008, peak = 0.5, hold = 0.05, decay = 1.2, release = 0.06, duration = 1.8, startAt = 0 }) {
  const g = gainNode.gain;
  const t = c.currentTime + startAt;
  g.cancelScheduledValues(t);
  g.setValueAtTime(0, t);
  g.linearRampToValueAtTime(peak * MASTER, t + attack);
  g.linearRampToValueAtTime(peak * MASTER, t + attack + hold);
  g.exponentialRampToValueAtTime(0.0001, t + Math.max(attack + hold + decay, duration - release));
  g.linearRampToValueAtTime(0, t + duration);
}

function tone(c, { type = "sine", freq, dur, gainOpts = {}, startAt = 0 }) {
  const o = c.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, c.currentTime + startAt);
  const g = c.createGain();
  o.connect(g); g.connect(c.destination);
  shape(c, g, { duration: dur, startAt, ...gainOpts });
  o.start(c.currentTime + startAt);
  o.stop(c.currentTime + startAt + dur + 0.05);
}

function slide(c, { type = "sine", from, to, dur, gainOpts = {}, startAt = 0 }) {
  const o = c.createOscillator();
  o.type = type;
  const t0 = c.currentTime + startAt;
  o.frequency.setValueAtTime(from, t0);
  o.frequency.exponentialRampToValueAtTime(Math.max(to, 20), t0 + dur);
  const g = c.createGain();
  o.connect(g); g.connect(c.destination);
  shape(c, g, { duration: dur, startAt, ...gainOpts });
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

function noiseBurst(c, { dur, gainOpts = {}, filterType = "highpass", filterFreq = 4000, filterQ = 1, startAt = 0 }) {
  const bufSize = Math.max(1, Math.floor(c.sampleRate * dur));
  const buffer = c.createBuffer(1, bufSize, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource(); src.buffer = buffer;
  const filter = c.createBiquadFilter();
  filter.type = filterType; filter.frequency.value = filterFreq; filter.Q.value = filterQ;
  const g = c.createGain();
  src.connect(filter); filter.connect(g); g.connect(c.destination);
  shape(c, g, { duration: dur, startAt, ...gainOpts });
  src.start(c.currentTime + startAt);
  src.stop(c.currentTime + startAt + dur + 0.05);
}

/* Snare drum hit — noise burst with band-pass */
function snareHit(c, startAt, peak = 0.4) {
  noiseBurst(c, { dur: 0.15, filterType: "bandpass", filterFreq: 1800, filterQ: 3, startAt,
    gainOpts: { attack: 0.002, peak, decay: 0.13, release: 0.02 }});
  tone(c, { type: "triangle", freq: 220, dur: 0.12, startAt,
    gainOpts: { attack: 0.001, peak: peak * 0.6, decay: 0.1, release: 0.02 }});
}

/* Fife (piccolo) tone — bright square with slight vibrato */
function fifeTone(c, freq, startAt, dur, peak = 0.35) {
  tone(c, { type: "square", freq, dur, startAt,
    gainOpts: { attack: 0.01, peak, hold: 0.08, decay: dur - 0.15, release: 0.05 }});
  tone(c, { type: "sine", freq: freq * 2, dur: dur * 0.8, startAt,
    gainOpts: { attack: 0.01, peak: peak * 0.4, decay: dur * 0.7, release: 0.04 }});
}

/* Bugle brass note — sawtooth through low-pass filter */
function bugleNote(c, freq, startAt, dur, peak = 0.5) {
  const o = c.createOscillator();
  o.type = "sawtooth";
  const t0 = c.currentTime + startAt;
  o.frequency.setValueAtTime(freq * 0.97, t0);
  o.frequency.linearRampToValueAtTime(freq, t0 + 0.05);
  const filter = c.createBiquadFilter();
  filter.type = "lowpass"; filter.frequency.value = 2000; filter.Q.value = 3;
  const g = c.createGain();
  o.connect(filter); filter.connect(g); g.connect(c.destination);
  shape(c, g, { attack: 0.02, peak, hold: dur * 0.5, decay: dur * 0.4, release: 0.05, duration: dur, startAt });
  o.start(t0); o.stop(t0 + dur + 0.05);
}

/* Cannon boom — low sub + noise burst */
function cannonBoom(c, startAt, peak = 0.6) {
  slide(c, { type: "sine", from: 90, to: 40, dur: 0.9, startAt,
    gainOpts: { attack: 0.003, peak, hold: 0.15, decay: 0.7, release: 0.05 }});
  noiseBurst(c, { dur: 0.6, filterType: "lowpass", filterFreq: 400, startAt,
    gainOpts: { attack: 0.003, peak: peak * 0.6, decay: 0.55, release: 0.04 }});
  // crackle
  noiseBurst(c, { dur: 0.4, filterType: "highpass", filterFreq: 3000, startAt: startAt + 0.05,
    gainOpts: { attack: 0.005, peak: peak * 0.25, decay: 0.35, release: 0.03 }});
}

/* Bell peal — pure sine with harmonics */
function bellPeal(c, freq, startAt, dur, peak = 0.5) {
  tone(c, { type: "sine", freq, dur, startAt,
    gainOpts: { attack: 0.002, peak, hold: 0.05, decay: dur - 0.1, release: 0.05 }});
  tone(c, { type: "triangle", freq: freq * 1.5, dur: dur * 0.75, startAt,
    gainOpts: { attack: 0.002, peak: peak * 0.4, decay: dur * 0.7, release: 0.04 }});
  tone(c, { type: "sine", freq: freq * 3.01, dur: dur * 0.6, startAt,
    gainOpts: { attack: 0.002, peak: peak * 0.18, decay: dur * 0.55, release: 0.04 }});
}

/* ---------- CORRECT (8) — each ~2.5–3.5 s ---------- */

const CORRECT_SOUNDS = [

  // #1 — Fife trill (do-mi-sol-do rising)
  function fifeTrill(c) {
    const notes = [523.25, 659.25, 784.0, 1046.5, 1318.5, 1046.5, 784.0, 1046.5];
    notes.forEach((f, i) => fifeTone(c, f, i * 0.28, 0.35, 0.4));
    fifeTone(c, 1046.5, 2.3, 1.0, 0.5);
  },

  // #2 — Snare drum roll rat-a-tat-tat
  function snareRoll(c) {
    for (let i = 0; i < 12; i++) snareHit(c, i * 0.15, 0.38);
    // 4-note finale
    snareHit(c, 1.9, 0.5);
    snareHit(c, 2.15, 0.5);
    snareHit(c, 2.4, 0.5);
    snareHit(c, 2.7, 0.6);
  },

  // #3 — Bugle "Charge!" fanfare
  function bugleCharge(c) {
    bugleNote(c, 392.0, 0.0, 0.25, 0.5);   // G
    bugleNote(c, 523.25, 0.25, 0.25, 0.5); // C
    bugleNote(c, 659.25, 0.5, 0.25, 0.5);  // E
    bugleNote(c, 784.0, 0.75, 0.5, 0.55);  // G
    bugleNote(c, 659.25, 1.3, 0.25, 0.5);
    bugleNote(c, 784.0, 1.55, 0.9, 0.6);
    bugleNote(c, 1046.5, 2.5, 1.0, 0.65);  // triumphant top
  },

  // #4 — Yankee Doodle opening riff
  function yankeeDoodle(c) {
    // "Yan-kee Doo-dle came to town" — G G A B G B A
    const notes = [
      { f: 392.0, t: 0.0 },   // G
      { f: 392.0, t: 0.28 },  // G
      { f: 440.0, t: 0.55 },  // A
      { f: 493.88, t: 0.83 }, // B
      { f: 392.0, t: 1.10 },  // G
      { f: 493.88, t: 1.38 }, // B
      { f: 440.0, t: 1.65 },  // A
      { f: 392.0, t: 2.0 },
      { f: 587.32, t: 2.35, d: 1.0 } // finale D
    ];
    for (const n of notes) fifeTone(c, n.f, n.t, n.d || 0.28, 0.42);
    // Snare on beats
    for (let i = 0; i < 8; i++) snareHit(c, i * 0.28 + 0.05, 0.32);
  },

  // #5 — Cannon salute (three booms)
  function cannonSalute(c) {
    cannonBoom(c, 0.0, 0.65);
    cannonBoom(c, 1.0, 0.65);
    cannonBoom(c, 2.0, 0.7);
  },

  // #6 — Liberty Bell peal
  function libertyBell(c) {
    bellPeal(c, 440.0, 0.0, 2.0, 0.5);
    bellPeal(c, 523.25, 0.6, 1.8, 0.45);
    bellPeal(c, 659.25, 1.2, 1.6, 0.4);
    bellPeal(c, 440.0, 2.0, 1.2, 0.4);
  },

  // #7 — Marching band brass chord hit
  function brassHit(c) {
    // I-V-I brass progression
    const chord = [130.81, 196.0, 261.63, 329.63]; // C major
    for (const f of chord) bugleNote(c, f, 0.0, 0.8, 0.4);
    const dom = [196.0, 293.66, 392.0, 493.88]; // G major
    for (const f of dom) bugleNote(c, f, 0.85, 0.7, 0.42);
    for (const f of chord) bugleNote(c, f, 1.6, 1.3, 0.5);
    // sparkle top note
    bugleNote(c, 523.25, 1.6, 1.4, 0.55);
  },

  // #8 — Star-Spangled Banner opening
  function starSpangled(c) {
    // "Oh say can you see" — descending then rising
    // key of C: G4 E4 C4 E4 G4 C5
    const notes = [
      { f: 392.0, t: 0.0, d: 0.4 },   // G4 "Oh"
      { f: 329.63, t: 0.4, d: 0.4 },  // E4 "say"
      { f: 261.63, t: 0.8, d: 0.5 },  // C4 "can"
      { f: 329.63, t: 1.3, d: 0.35 }, // E4 "you"
      { f: 392.0, t: 1.65, d: 0.35 }, // G4 "see"
      { f: 523.25, t: 2.0, d: 1.2 }   // C5 (triumphant)
    ];
    for (const n of notes) bugleNote(c, n.f, n.t, n.d, 0.5);
    // subtle snare pulse
    snareHit(c, 0.0, 0.25);
    snareHit(c, 0.8, 0.28);
    snareHit(c, 1.65, 0.28);
    snareHit(c, 2.0, 0.35);
  }
];

/* ---------- WRONG (8) — each ~2.5–3.5 s ---------- */

const WRONG_SOUNDS = [

  // #1 — Deflated bugle (descending, sad)
  function deflatedBugle(c) {
    slide(c, { type: "sawtooth", from: 523.25, to: 220, dur: 1.5,
      gainOpts: { attack: 0.03, peak: 0.45, hold: 0.15, decay: 1.2, release: 0.05 }});
    // low sad harmonic
    slide(c, { type: "triangle", from: 261.63, to: 110, dur: 1.5,
      gainOpts: { attack: 0.04, peak: 0.25, decay: 1.3, release: 0.05 }});
    // final low held note
    tone(c, { type: "sawtooth", freq: 174.61, dur: 1.4, startAt: 1.45,
      gainOpts: { attack: 0.04, peak: 0.4, hold: 0.5, decay: 0.85, release: 0.05 }});
  },

  // #2 — Muffled drum roll (funeral march feel)
  function muffledDrum(c) {
    for (let i = 0; i < 10; i++) {
      tone(c, { type: "sine", freq: 90, dur: 0.25, startAt: i * 0.28,
        gainOpts: { attack: 0.003, peak: 0.55, decay: 0.22, release: 0.02 }});
      noiseBurst(c, { dur: 0.2, filterType: "lowpass", filterFreq: 350, startAt: i * 0.28,
        gainOpts: { attack: 0.005, peak: 0.28, decay: 0.18, release: 0.02 }});
    }
  },

  // #3 — Cannon miss (fizzle then dud)
  function cannonMiss(c) {
    // failed ignition fizzle
    noiseBurst(c, { dur: 1.5, filterType: "bandpass", filterFreq: 900, filterQ: 3,
      gainOpts: { attack: 0.05, peak: 0.35, hold: 0.4, decay: 1.0, release: 0.05 }});
    // small pop
    tone(c, { type: "sine", freq: 120, dur: 0.35, startAt: 1.4,
      gainOpts: { attack: 0.003, peak: 0.4, decay: 0.32, release: 0.02 }});
    // sad follow-up
    slide(c, { type: "sawtooth", from: 200, to: 100, dur: 1.2, startAt: 1.6,
      gainOpts: { attack: 0.02, peak: 0.4, hold: 0.3, decay: 0.85, release: 0.05 }});
  },

  // #4 — Off-key fife (wrong notes)
  function offKeyFife(c) {
    const notes = [523.25, 587.33, 466.16, 622.25, 415.30, 555.36, 349.23, 261.63];
    notes.forEach((f, i) => fifeTone(c, f, i * 0.32, 0.3, 0.35));
    // final wrong note
    fifeTone(c, 233.08, 2.6, 1.0, 0.4);
  },

  // #5 — Slow taps opening (military bugle)
  function slowTaps(c) {
    // Taps: G G C — G C E — G C E — three-note descending phrase
    bugleNote(c, 261.63, 0.0, 0.6, 0.45);  // C
    bugleNote(c, 261.63, 0.7, 0.6, 0.45);  // C
    bugleNote(c, 392.0, 1.3, 1.2, 0.55);   // G (held)
    bugleNote(c, 261.63, 2.5, 0.4, 0.4);   // C
    bugleNote(c, 220.0, 2.9, 0.6, 0.4);    // A (descending)
  },

  // #6 — Sad tuba (three low honks)
  function sadTuba(c) {
    slide(c, { type: "sawtooth", from: 130.81, to: 110, dur: 0.7, startAt: 0.0,
      gainOpts: { attack: 0.015, peak: 0.5, hold: 0.2, decay: 0.45, release: 0.05 }});
    slide(c, { type: "sawtooth", from: 110, to: 87.31, dur: 0.7, startAt: 0.9,
      gainOpts: { attack: 0.015, peak: 0.5, hold: 0.2, decay: 0.45, release: 0.05 }});
    slide(c, { type: "sawtooth", from: 87.31, to: 65.4, dur: 1.2, startAt: 1.8,
      gainOpts: { attack: 0.02, peak: 0.55, hold: 0.3, decay: 0.85, release: 0.05 }});
  },

  // #7 — Cracked bell (dissonant clang)
  function crackedBell(c) {
    // out-of-tune bell hits
    bellPeal(c, 440.0, 0.0, 1.5, 0.5);
    bellPeal(c, 466.16, 0.05, 1.5, 0.35); // slightly detuned, dissonant
    bellPeal(c, 622.25, 0.8, 1.4, 0.4);
    bellPeal(c, 415.3, 1.6, 1.6, 0.4);
  },

  // #8 — Wooden thud + sigh
  function thudAndSigh(c) {
    // heavy wooden thud
    tone(c, { type: "sine", freq: 75, dur: 0.4, startAt: 0.0,
      gainOpts: { attack: 0.003, peak: 0.65, decay: 0.35, release: 0.03 }});
    noiseBurst(c, { dur: 0.25, filterType: "lowpass", filterFreq: 350, startAt: 0.0,
      gainOpts: { attack: 0.005, peak: 0.35, decay: 0.22, release: 0.02 }});
    // sad sigh (breath-like descending fife)
    slide(c, { type: "sine", from: 466.16, to: 220, dur: 1.5, startAt: 0.5,
      gainOpts: { attack: 0.1, peak: 0.35, hold: 0.3, decay: 1.05, release: 0.05 }});
    // final low held
    tone(c, { type: "sine", freq: 174.61, dur: 1.0, startAt: 2.1,
      gainOpts: { attack: 0.05, peak: 0.3, decay: 0.9, release: 0.05 }});
  }
];

/* ---------- Public play API ---------- */

function pickIndex(len, lastIdx) {
  if (len <= 1) return 0;
  let i = Math.floor(Math.random() * len);
  if (i === lastIdx) i = (i + 1) % len;
  return i;
}

export function playCorrect() {
  const c = ensureCtx();
  if (!c) return;
  const idx = pickIndex(CORRECT_SOUNDS.length, lastCorrectIdx);
  lastCorrectIdx = idx;
  try { CORRECT_SOUNDS[idx](c); } catch (e) { /* fail silent */ }
  return idx;
}

export function playWrong() {
  const c = ensureCtx();
  if (!c) return;
  const idx = pickIndex(WRONG_SOUNDS.length, lastWrongIdx);
  lastWrongIdx = idx;
  try { WRONG_SOUNDS[idx](c); } catch (e) { /* fail silent */ }
  return idx;
}

export const correctCount = CORRECT_SOUNDS.length;
export const wrongCount   = WRONG_SOUNDS.length;
