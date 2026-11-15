// All sound is synthesized with WebAudio — no audio files, no network.
// The AudioContext is built lazily on the first user gesture and every
// effect is a no-op until then, so headless captures and muted browsers
// stay silent and error-free. A master gain feeds everything, so a single
// mute switch covers every effect at once. The rain is a looped, filtered
// noise bed that starts with the first unlock and never stops.
export function createAudio() {
  let ctx = null;
  let master = null;
  let noiseBuffer = null;
  let rainNodes = null;
  let muted = false;
  let gestureSeen = false;

  // Build (or resume) the context. Returns false when WebAudio is missing
  // or the browser refuses to create a context — callers never throw.
  // Resume is only attempted after a real user gesture: headless captures
  // have none, and retrying resume on every effect just spams warnings.
  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended' && gestureSeen) ctx.resume().catch(() => {});
      return true;
    }
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return false;
      ctx = new AudioContextClass();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.22;
      master.connect(ctx.destination);
      // Half a second of white noise, shared by every noise-based effect.
      noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
      startRain();
    } catch {
      ctx = null;
      return false;
    }
    return true;
  }

  // Rain bed: the shared noise buffer looped through a lowpass and a slow
  // tremolo, quiet enough to sit under gunfire.
  function startRain() {
    if (rainNodes) return;
    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer;
    source.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1400;
    const rainGain = ctx.createGain();
    rainGain.gain.value = 0.045;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.13;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.015;
    lfo.connect(lfoGain).connect(rainGain.gain);
    source.connect(filter).connect(rainGain).connect(master);
    source.start();
    lfo.start();
    rainNodes = { source, lfo };
  }

  // One shared envelope: `source` is started and stopped, `tail` is the last
  // node of its chain and gets the decaying gain. `when` schedules the
  // effect in the future; `slideTo` bends an oscillator's pitch down over
  // the effect's life.
  function play(source, tail, duration, gainValue, when = 0, slideTo = 0) {
    if (!ensure()) return;
    const start = ctx.currentTime + when;
    if (source.frequency) {
      source.frequency.setValueAtTime(source.frequency.value, start);
      if (slideTo) source.frequency.exponentialRampToValueAtTime(slideTo, start + duration);
    }
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(gainValue, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
    tail.connect(gain).connect(master);
    source.start(start);
    source.stop(start + duration + 0.02);
  }

  function noise(duration, filterFreq, gainValue, when = 0) {
    if (!ensure()) return;
    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    source.connect(filter);
    play(source, filter, duration, gainValue, when);
  }

  function tone(freq, duration, type, gainValue, when = 0, slideTo = 0) {
    if (!ensure()) return;
    const oscillator = ctx.createOscillator();
    oscillator.type = type;
    oscillator.frequency.value = freq;
    play(oscillator, oscillator, duration, gainValue, when, slideTo);
  }

  window.addEventListener('pointerdown', () => { gestureSeen = true; ensure(); }, { once: true });
  window.addEventListener('keydown', () => { gestureSeen = true; ensure(); }, { once: true });

  return {
    unlock() {
      gestureSeen = true;
      ensure();
    },
    setMuted(value) {
      muted = Boolean(value);
      if (master) master.gain.value = muted ? 0 : 0.22;
    },
    isMuted() {
      return muted;
    },
    shot(kind) {
      if (kind === 'shotgun') noise(0.22, 900, 0.9);
      else if (kind === 'smg') noise(0.08, 1600, 0.5);
      else if (kind === 'sniper') noise(0.3, 700, 1.0);
      else noise(0.12, 1200, 0.7);
      tone(160, 0.08, 'square', 0.18, 0, 60);
    },
    enemyShot() {
      noise(0.1, 900, 0.25);
    },
    dry() {
      tone(1400, 0.03, 'square', 0.12);
    },
    reload() {
      tone(500, 0.04, 'square', 0.12);
      tone(700, 0.04, 'square', 0.12, 0.25);
    },
    hit() {
      tone(1250, 0.05, 'square', 0.2);
    },
    kill() {
      tone(880, 0.07, 'square', 0.2);
      tone(1320, 0.1, 'square', 0.2, 0.08);
    },
    explosion() {
      noise(0.7, 400, 1.0);
      tone(90, 0.6, 'sine', 0.7, 0, 35);
    },
    smokePop() {
      noise(0.5, 600, 0.35);
    },
    flashPop() {
      tone(2400, 0.25, 'sine', 0.5, 0, 900);
      noise(0.15, 3000, 0.4);
    },
    plantBeep() {
      tone(880, 0.06, 'square', 0.16);
    },
    plantDone() {
      tone(660, 0.09, 'square', 0.2);
      tone(990, 0.14, 'square', 0.2, 0.1);
    },
    defuseBeep() {
      tone(1100, 0.05, 'square', 0.14);
    },
    buy() {
      tone(990, 0.06, 'sine', 0.25);
      tone(1480, 0.09, 'sine', 0.25, 0.07);
    },
    roundWin() {
      tone(523, 0.12, 'sine', 0.25);
      tone(659, 0.12, 'sine', 0.25, 0.12);
      tone(784, 0.2, 'sine', 0.25, 0.24);
    },
    roundLose() {
      tone(392, 0.16, 'sine', 0.25);
      tone(311, 0.24, 'sine', 0.25, 0.16);
    },
    hurt() {
      noise(0.12, 500, 0.4);
      tone(110, 0.12, 'sawtooth', 0.15, 0, 70);
    },
  };
}
