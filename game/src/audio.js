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
      if (gestureSeen && ctx.state === 'suspended') ctx.resume().catch(() => {});
      return ctx.state === 'running';
    }
    if (!gestureSeen) return false;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    try {
      ctx = new AC();
    } catch {
      return false;
    }
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.4;
    master.connect(ctx.destination);
    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 1.5, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    return ctx.state === 'running';
  }

  function unlock() {
    gestureSeen = true;
    if (ensure()) startRain();
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('pointerdown', unlock, { once: false });
    window.addEventListener('keydown', unlock, { once: false });
  }

  function startRain() {
    if (rainNodes || !ctx) return;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    src.loop = true;
    const lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 1100;
    const gain = ctx.createGain();
    gain.gain.value = 0.05;
    src.connect(lowpass).connect(gain).connect(master);
    src.start();
    rainNodes = { src, gain };
  }

  function tone(freq, dur, type, gainVal, when = 0, slideTo = 0) {
    if (!ensure()) return;
    const t0 = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo > 0) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gainVal, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  function noiseBurst(dur, gainVal, freq, when = 0, type = 'highpass') {
    if (!ensure()) return;
    const t0 = ctx.currentTime + when;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    src.playbackRate.value = 0.7 + Math.random() * 0.6;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gainVal, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter).connect(g).connect(master);
    src.start(t0);
    src.stop(t0 + dur + 0.05);
  }

  return {
    unlock,
    mute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.4;
      return muted;
    },
    shot(kind) {
      if (kind === 'rifle') {
        noiseBurst(0.12, 0.5, 900, 0, 'bandpass');
        tone(160, 0.09, 'square', 0.22, 0, 60);
      } else if (kind === 'smg') {
        noiseBurst(0.08, 0.4, 1200, 0, 'bandpass');
        tone(220, 0.06, 'square', 0.16, 0, 90);
      } else if (kind === 'shotgun') {
        noiseBurst(0.28, 0.7, 400, 0, 'lowpass');
        tone(90, 0.2, 'sawtooth', 0.3, 0, 40);
      } else if (kind === 'sniper') {
        noiseBurst(0.3, 0.6, 700, 0, 'bandpass');
        tone(110, 0.25, 'square', 0.28, 0, 45);
      } else {
        noiseBurst(0.09, 0.35, 1500, 0, 'bandpass');
        tone(300, 0.05, 'square', 0.14, 0, 120);
      }
    },
    empty() {
      tone(1400, 0.04, 'square', 0.1);
    },
    reload() {
      tone(500, 0.05, 'square', 0.12, 0);
      tone(700, 0.05, 'square', 0.12, 0.12);
    },
    hit() {
      tone(900, 0.05, 'sine', 0.18);
    },
    kill() {
      tone(660, 0.08, 'sine', 0.22);
      tone(990, 0.12, 'sine', 0.22, 0.07);
    },
    hurt() {
      tone(180, 0.15, 'sawtooth', 0.25, 0, 90);
    },
    step() {
      noiseBurst(0.05, 0.06, 500, 0, 'lowpass');
    },
    boom() {
      noiseBurst(0.9, 0.9, 200, 0, 'lowpass');
      tone(60, 0.7, 'sine', 0.5, 0, 30);
    },
    flash() {
      tone(2400, 0.4, 'sine', 0.3, 0, 600);
      noiseBurst(0.2, 0.3, 3000, 0, 'highpass');
    },
    pickup() {
      tone(520, 0.06, 'sine', 0.2);
      tone(780, 0.09, 'sine', 0.2, 0.06);
    },
    buy() {
      tone(440, 0.07, 'sine', 0.2);
      tone(660, 0.1, 'sine', 0.2, 0.06);
    },
    radio() {
      tone(1100, 0.04, 'square', 0.1);
      tone(1100, 0.04, 'square', 0.1, 0.08);
    },
    plantBeep() {
      tone(1200, 0.06, 'square', 0.18);
    },
    defuseBeep() {
      tone(1000, 0.06, 'square', 0.18);
    },
    planted() {
      tone(300, 0.15, 'square', 0.25);
      tone(450, 0.15, 'square', 0.25, 0.12);
      tone(600, 0.3, 'square', 0.25, 0.24);
    },
    defused() {
      tone(600, 0.12, 'sine', 0.25);
      tone(450, 0.12, 'sine', 0.25, 0.1);
      tone(300, 0.25, 'sine', 0.25, 0.2);
    },
    round() {
      tone(523, 0.12, 'sine', 0.22);
      tone(659, 0.12, 'sine', 0.22, 0.1);
      tone(784, 0.2, 'sine', 0.22, 0.2);
    },
    denied() {
      tone(200, 0.12, 'square', 0.18, 0, 140);
    },
  };
}
