// CONTRACT (audio specialist owns this module):
//   export function createAudio() -> {
//     unlock(), play(name), setMusic(stateName, revertSec?), tickMusic(state) }
// All sound synthesized with WebAudio (no external files). Required SFX names:
// coin, jump, land, stomp, scan, scanhit, hurt, oneup, win, gameover, respawn,
// dialogue. Music states: explore, danger, victory, fail — original adaptive
// pulp-adventure score (layered, crossfading), no copied melodies.
//
// Implementation: layered oscillator/noise synthesis through a master
// compressor + generated-impulse convolver reverb. Adaptive score runs on a
// lookahead scheduler (setInterval ~100ms, ~250ms lookahead on ctx.currentTime,
// independent of rAF). Per-state gain buses crossfade over ~1.5s. Music bus
// sits ~-14dB under SFX. tickMusic() adds subtle proximity-driven intensity.
export function createAudio() {
  let ctx = null;
  let started = false;
  let musicState = 'explore';
  let revertAt = 0;
  let dangerHeat = 0;         // 0..1 adaptive intensity from tickMusic
  let threatTicks = 0;        // consecutive ticks with a live enemy nearby
  let calmTicks = 0;          // consecutive ticks with no threat

  // node graph refs
  let master, comp, reverb, reverbGain, sfxBus, musicBus, analyser;
  let muted = false;
  const stateBus = {};        // name -> GainNode (music crossfade buses)
  const stateOn = {};         // name -> target level (0/1)
  let prevState = null, prevStateDroppedAt = 0;

  // scheduler
  const BPM = 92;
  const STEP = 60 / BPM / 4;  // 16th note
  let nextNoteTime = 0;
  let stepIndex = 0;
  let schedTimer = 0;

  // ---------- graph ----------
  function ac() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    return ctx;
  }

  function makeImpulse(seconds, decay) {
    const rate = ctx.sampleRate, len = Math.floor(rate * seconds);
    const buf = ctx.createBuffer(2, len, rate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return buf;
  }

  let noiseBuf = null;
  function getNoiseBuf() {
    if (!noiseBuf) {
      const rate = ctx.sampleRate, len = rate * 2;
      noiseBuf = ctx.createBuffer(1, len, rate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    return noiseBuf;
  }

  let crackleBuf = null;      // stepped random => aliased digital crackle
  function getCrackleBuf() {
    if (!crackleBuf) {
      const rate = ctx.sampleRate, len = Math.floor(rate * 0.6);
      crackleBuf = ctx.createBuffer(1, len, rate);
      const d = crackleBuf.getChannelData(0);
      let hold = 0;
      for (let i = 0; i < len; i++) {
        if (i % 96 === 0) hold = (Math.random() * 2 - 1) * (Math.random() > 0.4 ? 1 : 0.15);
        d[i] = hold;
      }
    }
    return crackleBuf;
  }

  function buildGraph() {
    comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18; comp.knee.value = 20;
    comp.ratio.value = 5; comp.attack.value = 0.004; comp.release.value = 0.22;

    master = ctx.createGain(); master.gain.value = muted ? 0 : 0.9;
    analyser = ctx.createAnalyser(); analyser.fftSize = 2048;

    comp.connect(master); master.connect(analyser); analyser.connect(ctx.destination);

    reverb = ctx.createConvolver();
    reverb.buffer = makeImpulse(1.8, 3.2);
    reverbGain = ctx.createGain(); reverbGain.gain.value = 0.22;
    reverb.connect(reverbGain); reverbGain.connect(comp);

    sfxBus = ctx.createGain(); sfxBus.gain.value = 1.0;
    sfxBus.connect(comp);
    const sfxSend = ctx.createGain(); sfxSend.gain.value = 0.35;
    sfxBus.connect(sfxSend); sfxSend.connect(reverb);

    musicBus = ctx.createGain(); musicBus.gain.value = 0.2; // ~-14dB under SFX
    musicBus.connect(comp);
    const musSend = ctx.createGain(); musSend.gain.value = 0.25;
    musicBus.connect(musSend); musSend.connect(reverb);

    for (const s of ['explore', 'danger', 'victory', 'fail']) {
      const g = ctx.createGain();
      g.gain.value = s === musicState ? 1 : 0;
      g.connect(musicBus);
      stateBus[s] = g;
      stateOn[s] = s === musicState ? 1 : 0;
    }
  }

  // ---------- synth primitives ----------
  // Schedules an oscillator note. dest defaults to sfxBus.
  function osc(t0, dur, freq, o = {}) {
    const type = o.type || 'sine', vol = o.vol != null ? o.vol : 0.15;
    const a = o.attack != null ? o.attack : 0.004;
    const node = ctx.createOscillator(), g = ctx.createGain();
    node.type = type;
    node.frequency.setValueAtTime(freq, t0);
    if (o.slideTo) node.frequency.exponentialRampToValueAtTime(Math.max(20, o.slideTo), t0 + (o.slideDur || dur));
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    let out = g;
    if (o.filter) {
      const f = ctx.createBiquadFilter();
      f.type = o.filter; f.frequency.setValueAtTime(o.filterFreq || 1200, t0);
      if (o.filterSlideTo) f.frequency.exponentialRampToValueAtTime(o.filterSlideTo, t0 + dur);
      f.Q.value = o.q || 1;
      g.connect(f); out = f;
    }
    out.connect(o.dest || sfxBus);
    node.connect(g);
    node.start(t0); node.stop(t0 + dur + 0.05);
    return node;
  }

  function noise(t0, dur, o = {}) {
    const src = ctx.createBufferSource();
    src.buffer = o.crackle ? getCrackleBuf() : getNoiseBuf();
    src.loop = true;
    if (o.rate) src.playbackRate.value = o.rate;
    const g = ctx.createGain();
    const vol = o.vol != null ? o.vol : 0.12, a = o.attack != null ? o.attack : 0.003;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    let out = g;
    if (o.filter) {
      const f = ctx.createBiquadFilter();
      f.type = o.filter; f.frequency.setValueAtTime(o.filterFreq || 1000, t0);
      if (o.filterSlideTo) f.frequency.exponentialRampToValueAtTime(o.filterSlideTo, t0 + dur);
      f.Q.value = o.q || 1;
      g.connect(f); out = f;
    }
    out.connect(o.dest || sfxBus);
    src.connect(g);
    src.start(t0); src.stop(t0 + dur + 0.05);
  }

  // ---------- music instruments (into a state bus) ----------
  function pluckBass(t0, freq, dest, vol = 0.5) {
    const o1 = ctx.createOscillator(); o1.type = 'triangle'; o1.frequency.value = freq;
    const o2 = ctx.createOscillator(); o2.type = 'sawtooth'; o2.frequency.value = freq;
    const g = ctx.createGain(), f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.Q.value = 2;
    f.frequency.setValueAtTime(freq * 8, t0);
    f.frequency.exponentialRampToValueAtTime(freq * 1.6, t0 + 0.18);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.34);
    const g2 = ctx.createGain(); g2.gain.value = 0.25;
    o1.connect(g); o2.connect(g2); g2.connect(g);
    g.connect(f); f.connect(dest);
    o1.start(t0); o2.start(t0); o1.stop(t0 + 0.4); o2.stop(t0 + 0.4);
  }

  function marimba(t0, freq, dest, vol = 0.34) {
    const o1 = ctx.createOscillator(); o1.type = 'sine'; o1.frequency.value = freq;
    const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = freq * 3.97;
    const g1 = ctx.createGain(), g2 = ctx.createGain();
    g1.gain.setValueAtTime(0.0001, t0);
    g1.gain.linearRampToValueAtTime(vol, t0 + 0.003);
    g1.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.42);
    g2.gain.setValueAtTime(0.0001, t0);
    g2.gain.linearRampToValueAtTime(vol * 0.22, t0 + 0.002);
    g2.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.08);
    o1.connect(g1); o2.connect(g2); g1.connect(dest); g2.connect(dest);
    o1.start(t0); o2.start(t0); o1.stop(t0 + 0.5); o2.stop(t0 + 0.12);
  }

  function shaker(t0, dest, vol = 0.10) {
    noise(t0, 0.06, { vol, attack: 0.008, filter: 'highpass', filterFreq: 6000, dest });
  }

  function kick(t0, dest, vol = 0.5, fStart = 120) {
    osc(t0, 0.16, fStart, { type: 'sine', vol, slideTo: 42, slideDur: 0.12, dest });
  }

  function padChord(t0, freqs, dest, dur = 2.6, vol = 0.10) {
    for (const f of freqs) {
      const o = ctx.createOscillator(); o.type = 'triangle';
      o.frequency.value = f;
      o.detune.value = (Math.random() - 0.5) * 8;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(vol, t0 + dur * 0.35);
      g.gain.linearRampToValueAtTime(vol * 0.8, t0 + dur * 0.7);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400;
      o.connect(g); g.connect(lp); lp.connect(dest);
      o.start(t0); o.stop(t0 + dur + 0.05);
    }
  }

  function tensionDrone(t0, dest, dur = 2.6) {
    for (const [f, det] of [[110, -8], [110 * 1.414, 9]]) { // tritone pair
      const o = ctx.createOscillator(); o.type = 'sawtooth';
      o.frequency.value = f; o.detune.value = det;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(0.05, t0 + 0.4);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700; lp.Q.value = 3;
      o.connect(g); g.connect(lp); lp.connect(dest);
      o.start(t0); o.stop(t0 + dur + 0.05);
    }
  }

  function brass(t0, freq, dest, dur = 0.3, vol = 0.22) {
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = freq;
    const o2 = ctx.createOscillator(); o2.type = 'sawtooth'; o2.frequency.value = freq; o2.detune.value = 7;
    const g = ctx.createGain(), f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.Q.value = 1.2;
    f.frequency.setValueAtTime(600, t0);
    f.frequency.linearRampToValueAtTime(2600, t0 + Math.min(0.08, dur * 0.4));
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.03);
    g.gain.setValueAtTime(vol, t0 + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); o2.connect(g); g.connect(f); f.connect(dest);
    o.start(t0); o2.start(t0); o.stop(t0 + dur + 0.05); o2.stop(t0 + dur + 0.05);
  }

  // ---------- musical material (original) ----------
  // Note frequencies
  const N = {
    D2: 73.42, F2: 87.31, G2: 98.0, A2: 110.0, Bb1: 58.27, Bb2: 116.54, C3: 130.81,
    D3: 146.83, Eb2: 77.78, Eb3: 155.56, F3: 174.61, G3: 196.0, A3: 220.0, Bb3: 233.08,
    C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.0, A4: 440.0, Bb4: 466.16,
    C5: 523.25, D5: 587.33, Fs4: 369.99, Fs3: 185.0, B3: 246.94, E3: 164.81, A1: 55.0, D1: 36.71,
    B4: 493.88, Cs4: 277.18, Cs5: 554.37, E5: 659.26, G5: 783.99,
  };

  // 4-bar loop (64 sixteenth steps). Progression: Dm | F | Bb | C  (D dorian warmth)
  const EXP_BASS = {}; // step -> freq
  [[0, N.D2], [6, N.A2], [8, N.D2], [12, N.D3], [16, N.F2], [22, N.C3], [24, N.F2], [28, N.F3],
   [32, N.Bb1], [38, N.F2], [40, N.Bb2], [44, N.D3], [48, N.C3], [54, N.G2], [56, N.C3], [60, N.E3],
  ].forEach(([s, f]) => EXP_BASS[s] = f);

  // Original marimba motif (D minor pentatonic + color tones), sparse & singable
  const EXP_MEL = {};
  [[0, N.D4], [4, N.F4], [6, N.G4], [8, N.A4], [14, N.C5], [16, N.A4], [20, N.F4], [24, N.G4],
   [32, N.D4], [36, N.F4], [40, N.D5], [44, N.C5], [48, N.A4], [52, N.G4], [54, N.F4], [56, N.E4], [60, N.D4],
  ].forEach(([s, f]) => EXP_MEL[s] = f);

  const EXP_PADS = [ // one chord per bar
    [N.D3, N.F3, N.A3, N.C4], [N.F3, N.A3, N.C4, N.E4],
    [N.Bb2, N.D3, N.F3, N.A3], [N.C3, N.E3, N.G3, N.Bb3],
  ];

  // danger: 2-bar loop (32 steps). Dm with b2 sting; urgent low pulse.
  const DNG_BASS = {};
  [[0, N.D2], [4, N.D2], [8, N.D2], [12, N.Eb2], [16, N.D2], [20, N.D2], [24, N.C3], [28, N.Bb1],
  ].forEach(([s, f]) => DNG_BASS[s] = f);
  const DNG_MEL = {};
  [[0, N.D4], [6, N.Eb3 * 2], [12, N.D4], [16, N.F4], [22, N.E4], [28, N.Eb3 * 2],
  ].forEach(([s, f]) => DNG_MEL[s] = f);

  // victory: 2-bar bright loop in D major
  const VIC_ARP = {};
  [[0, N.D4], [2, N.Fs4], [4, N.A4], [6, N.D5], [8, N.A4], [10, N.Fs4], [12, N.A4], [14, N.D5],
   [16, N.G4], [18, N.B4], [20, N.D5], [22, N.G5], [24, N.A4], [26, N.Cs5], [28, N.E5], [30, N.D5],
  ].forEach(([s, f]) => VIC_ARP[s] = f);
  const VIC_BASS = {};
  [[0, N.D2], [8, N.A2], [16, N.G2], [24, N.A2]].forEach(([s, f]) => VIC_BASS[s] = f);

  // ---------- per-state step schedulers ----------
  function schedExplore(step, t, dest) {
    const s64 = step % 64;
    if (EXP_BASS[s64] != null) pluckBass(t, EXP_BASS[s64], dest);
    if (EXP_MEL[s64] != null) marimba(t, EXP_MEL[s64], dest);
    if (s64 % 16 === 0) padChord(t, EXP_PADS[(s64 / 16) | 0], dest, STEP * 16 + 0.4);
    if (s64 % 4 === 2) shaker(t, dest, 0.07 + dangerHeat * 0.03);
    // adaptive: kick swells with proximity heat so threat is felt pre-damage
    if (s64 % 8 === 0) kick(t, dest, 0.3 + dangerHeat * 0.25, 100);
    if (dangerHeat > 0.5 && s64 % 8 === 4) kick(t, dest, 0.2 + dangerHeat * 0.2, 110);
    // adaptive: extra offbeat shaker + 8th-note low D2 pulse when enemies near
    if (dangerHeat > 0.5 && s64 % 4 === 3) shaker(t, dest, 0.06);
    if (dangerHeat > 0.5 && s64 % 8 === 4) pluckBass(t, N.D2, dest, 0.3 + dangerHeat * 0.2);
  }

  function schedDanger(step, t, dest) {
    const s32 = step % 32;
    if (DNG_BASS[s32] != null) pluckBass(t, DNG_BASS[s32], dest, 0.55);
    if (DNG_MEL[s32] != null) marimba(t, DNG_MEL[s32], dest, 0.3);
    if (s32 === 0 || s32 === 16) tensionDrone(t, dest, STEP * 16 + 0.3);
    if (s32 % 4 === 0) kick(t, dest, 0.5, 130);            // urgent quarter pulse
    if (s32 % 4 === 2) shaker(t, dest, 0.1);
    if (dangerHeat > 0.3 && s32 % 2 === 1) shaker(t, dest, 0.05 + dangerHeat * 0.05);
  }

  function schedVictory(step, t, dest) {
    const s32 = step % 32;
    if (VIC_ARP[s32] != null) marimba(t, VIC_ARP[s32], dest, 0.3);
    if (VIC_BASS[s32] != null) pluckBass(t, VIC_BASS[s32], dest, 0.5);
    if (s32 === 0) padChord(t, [N.D3, N.Fs3, N.A3, N.D4], dest, STEP * 16 + 0.4, 0.12);
    if (s32 === 16) padChord(t, [N.G2 * 2, N.B3, N.D4], dest, STEP * 16 + 0.4, 0.12);
    if (s32 % 8 === 0) brass(t, s32 < 16 ? N.D3 : N.A2 * 2, dest, STEP * 6, 0.12);
    if (s32 % 4 === 2) shaker(t, dest, 0.08);
  }

  function schedFail(step, t, dest) {
    const s64 = step % 64;
    if (s64 === 0) padChord(t, [N.D2, N.A2, N.D3, N.F3], dest, STEP * 32 + 0.6, 0.12);
    if (s64 === 32) padChord(t, [N.Bb1, N.F2, N.Bb2, N.D3], dest, STEP * 32 + 0.6, 0.11);
    if (s64 === 16) marimba(t, N.D3, dest, 0.16);
    if (s64 === 48) marimba(t, N.A2 * 2, dest, 0.14);
  }

  const STATE_SCHED = { explore: schedExplore, danger: schedDanger, victory: schedVictory, fail: schedFail };

  function activeStates() {
    const list = [musicState];
    if (prevState && prevState !== musicState) {
      if (performance.now() - prevStateDroppedAt < 2200) list.push(prevState);
      else prevState = null;
    }
    return list;
  }

  function schedulerTick() {
    if (!ctx) return;
    const now = ctx.currentTime;
    // If we fell far behind (heavy throttling), jump ahead instead of burst-playing.
    if (nextNoteTime < now - 0.4) {
      const missed = Math.ceil((now + 0.1 - nextNoteTime) / STEP);
      stepIndex += missed;
      nextNoteTime += missed * STEP;
    }
    while (nextNoteTime < now + 0.25) {
      for (const s of activeStates()) STATE_SCHED[s](stepIndex, nextNoteTime, stateBus[s]);
      stepIndex++;
      nextNoteTime += STEP;
    }
  }

  // ---------- SFX ----------
  const SFX = {
    coin() {
      const t = ctx.currentTime;
      osc(t, 0.12, 1318.5, { type: 'sine', vol: 0.2 });
      osc(t + 0.07, 0.22, 1760, { type: 'sine', vol: 0.18 });
      osc(t + 0.07, 0.18, 2637, { type: 'triangle', vol: 0.05 });
      // sparkle tail
      for (let i = 0; i < 4; i++) {
        osc(t + 0.16 + i * 0.045, 0.07, 2093 * (1 + Math.random() * 0.5), { type: 'sine', vol: 0.03 });
      }
    },
    jump() {
      const t = ctx.currentTime;
      noise(t, 0.18, { vol: 0.1, attack: 0.02, filter: 'bandpass', filterFreq: 500, filterSlideTo: 1600, q: 1.5 });
      osc(t, 0.2, 260, { type: 'sine', vol: 0.12, slideTo: 620, slideDur: 0.16 });
    },
    land() {
      const t = ctx.currentTime;
      osc(t, 0.13, 95, { type: 'sine', vol: 0.3, slideTo: 48, slideDur: 0.1 });
      noise(t, 0.12, { vol: 0.09, attack: 0.005, filter: 'lowpass', filterFreq: 900, filterSlideTo: 250 });
    },
    stomp() {
      const t = ctx.currentTime;
      noise(t, 0.1, { vol: 0.22, filter: 'bandpass', filterFreq: 320, q: 2 });        // crunch body
      noise(t, 0.06, { vol: 0.14, filter: 'highpass', filterFreq: 3000 });            // metal sizzle
      osc(t, 0.08, 160, { type: 'square', vol: 0.14, slideTo: 70 });
      osc(t + 0.07, 0.3, 220, { type: 'sine', vol: 0.16, slideTo: 760, slideDur: 0.22 }); // boing spring
    },
    scan() {
      const t = ctx.currentTime;
      osc(t, 0.14, 620, { type: 'sawtooth', vol: 0.07, slideTo: 2100, slideDur: 0.12, filter: 'bandpass', filterFreq: 1400, q: 2 });
      osc(t, 0.12, 620, { type: 'sine', vol: 0.08, slideTo: 2100, slideDur: 0.12 });
    },
    scanhit() {
      const t = ctx.currentTime;
      SFX.scan();
      osc(t + 0.1, 0.16, 1500, { type: 'sawtooth', vol: 0.14, slideTo: 90, slideDur: 0.14 }); // zap
      noise(t + 0.16, 0.32, { crackle: true, vol: 0.16, rate: 0.9, filter: 'bandpass', filterFreq: 2400, q: 0.8 }); // digital disintegration
      noise(t + 0.2, 0.25, { crackle: true, vol: 0.1, rate: 0.5, filter: 'lowpass', filterFreq: 1800 });
    },
    hurt() {
      const t = ctx.currentTime;
      osc(t, 0.28, 108, { type: 'sawtooth', vol: 0.16, filter: 'lowpass', filterFreq: 1200 });
      osc(t, 0.28, 113, { type: 'sawtooth', vol: 0.12, filter: 'lowpass', filterFreq: 1000 }); // beat-frequency buzz
      osc(t + 0.02, 0.34, 420, { type: 'triangle', vol: 0.16, slideTo: 130, slideDur: 0.3 });
    },
    oneup() {
      const t = ctx.currentTime;
      [N.D4, N.Fs4, N.A4, N.D5, N.Fs4 * 2].forEach((f, i) => {
        osc(t + i * 0.08, 0.18, f, { type: 'square', vol: 0.07 });
        osc(t + i * 0.08, 0.2, f, { type: 'triangle', vol: 0.1 });
      });
      osc(t + 0.42, 0.45, N.D5 * 1.5, { type: 'sine', vol: 0.07 });
    },
    win() {
      const t = ctx.currentTime;
      // grand original fanfare ~3.6s: three rising phrases then held chord
      const ph = [
        [0.0, [N.D3, N.A3, N.D4], 0.32],
        [0.36, [N.D3, N.A3, N.D4], 0.16],
        [0.56, [N.G3, N.B3, N.D4], 0.34],            // G major color
        [1.0, [N.A3, N.Cs4, N.E4, N.A4], 0.34],      // A major lift
        [1.5, [N.D3, N.Fs3, N.A3, N.D4], 1.9],       // held resolve
      ];
      for (const [dt, chord, dur] of ph) for (const f of chord) brass(t + dt, f, sfxBus, dur, 0.09);
      [N.D4, N.Fs4, N.A4, N.D5].forEach((f, i) => marimba(t + 1.55 + i * 0.12, f, sfxBus, 0.2));
      kick(t, sfxBus, 0.4, 150); kick(t + 0.56, sfxBus, 0.4, 150); kick(t + 1.5, sfxBus, 0.5, 160);
      noise(t + 1.5, 1.4, { vol: 0.05, attack: 0.3, filter: 'highpass', filterFreq: 7000 }); // cymbal shimmer
      osc(t + 2.6, 0.9, N.D5, { type: 'sine', vol: 0.06 });
    },
    gameover() {
      const t = ctx.currentTime;
      // somber descending motif: A - F - E - D over low pad
      padChord(t, [N.D2, N.A2, N.D3], sfxBus, 2.6, 0.08);
      [[0, N.A3], [0.5, N.F3], [1.0, N.E3], [1.6, N.D3]].forEach(([dt, f]) => {
        osc(t + dt, 0.7, f, { type: 'triangle', vol: 0.14 });
      });
      osc(t + 1.6, 1.1, N.D2, { type: 'sine', vol: 0.12 });
    },
    respawn() {
      const t = ctx.currentTime;
      noise(t, 0.5, { vol: 0.06, attack: 0.15, filter: 'bandpass', filterFreq: 900, filterSlideTo: 4200, q: 2 });
      [N.D4, N.A4, N.D5, N.Fs4 * 2].forEach((f, i) => {
        osc(t + 0.05 + i * 0.09, 0.3, f, { type: 'sine', vol: 0.07, attack: 0.04 });
      });
    },
    dialogue() {
      const t = ctx.currentTime;
      osc(t, 0.05, 940, { type: 'square', vol: 0.05, filter: 'highpass', filterFreq: 500 });
      osc(t, 0.04, 1880, { type: 'sine', vol: 0.025 });
    },
  };

  // ---------- public API ----------
  const api = {
    unlock() {
      const c = ac();
      if (c.state === 'suspended') c.resume();
      if (!started) {
        started = true;
        buildGraph();
        nextNoteTime = c.currentTime + 0.15;
        stepIndex = 0;
        schedTimer = setInterval(schedulerTick, 100);
        schedulerTick();
      }
    },
    play(name) {
      if (!started || !ctx) return;
      try { SFX[name]?.(); } catch (e) { /* never break the game loop */ }
    },
    setMusic(s, revertSec) {
      if (!STATE_SCHED[s]) return;
      revertAt = revertSec ? performance.now() + revertSec * 1000 : 0;
      if (s === musicState) return;
      prevState = musicState;
      prevStateDroppedAt = performance.now();
      musicState = s;
      if (started && ctx) {
        const t = ctx.currentTime;
        for (const name of Object.keys(stateBus)) {
          const target = name === s ? 1 : 0;
          if (stateOn[name] !== target) {
            stateOn[name] = target;
            stateBus[name].gain.cancelScheduledValues(t);
            stateBus[name].gain.setTargetAtTime(target, t, 0.5); // ~1.5s crossfade
          }
        }
      }
    },
    tickMusic(state, hazard) {
      // adaptive intensity: enemies near the player heat up the percussion
      let near = 0;
      if (state && state.enemies && state.player) {
        for (const e of state.enemies) {
          if (e.alive && Math.abs(e.x - state.player.x) < 400) near++;
        }
      }
      const target = Math.min(1, near * 0.6);
      dangerHeat += (target - dangerHeat) * 0.02;
      // proximity-driven state machine with hysteresis: swell into danger
      // BEFORE damage is taken, relax back to explore once the coast is clear.
      const threat = near > 0 || !!hazard;
      if (threat) revertAt = 0; // proximity logic owns the revert while threatened
      if (revertAt && performance.now() > revertAt) { revertAt = 0; api.setMusic('explore'); }
      if (threat) { threatTicks++; calmTicks = 0; }
      else { calmTicks++; threatTicks = 0; }
      if (musicState === 'explore' || musicState === 'danger') {
        if (musicState === 'explore' && threatTicks >= 30) api.setMusic('danger');
        else if (musicState === 'danger' && calmTicks >= 120 && !revertAt) api.setMusic('explore');
      }
    },
    // Host mute. The 2D game owns the speaker toggle and forwards the state in,
    // so one switch covers both documents.
    setMuted(on) {
      muted = !!on;
      if (master) master.gain.value = muted ? 0 : 0.9;
    },
    // debug/verification hooks (not part of the game contract)
    _debug() {
      return { ctx, analyser, getNextNoteTime: () => nextNoteTime, getState: () => musicState, getHeat: () => dangerHeat };
    },
  };
  return api;
}
