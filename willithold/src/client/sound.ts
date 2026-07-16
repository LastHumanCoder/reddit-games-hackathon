/**
 * Zero-asset WebAudio synth: ambient pad loop + game SFX.
 * Everything respects the persisted mute toggle.
 */

const MUTE_KEY = 'wih-muted';

class SoundManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private ambientGain: GainNode | null = null;
  private ambientTimer: ReturnType<typeof setInterval> | null = null;
  private ambientOsc: OscillatorNode[] = [];
  muted = false;

  constructor() {
    try {
      this.muted = localStorage.getItem(MUTE_KEY) === '1';
    } catch {
      this.muted = false;
    }
  }

  /** Must be called from a user gesture (autoplay policy). */
  ensure(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    try {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 1;
      this.master.connect(this.ctx.destination);
      this.startAmbient();
    } catch {
      this.ctx = null;
    }
  }

  toggle(): boolean {
    this.muted = !this.muted;
    try {
      localStorage.setItem(MUTE_KEY, this.muted ? '1' : '0');
    } catch {
      /* fine */
    }
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(this.muted ? 0 : 1, this.ctx.currentTime, 0.05);
    }
    return this.muted;
  }

  // ---------- ambient ----------

  private startAmbient(): void {
    if (!this.ctx || !this.master || this.ambientTimer) return;
    const ctx = this.ctx;
    this.ambientGain = ctx.createGain();
    this.ambientGain.gain.value = 0.05;
    // Slow filter LFO for movement.
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 700;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 260;
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);
    lfo.start();
    this.ambientGain.connect(filter);
    filter.connect(this.master);

    const chords: number[][] = [
      [110, 164.81, 220, 329.63], // A2 E3 A3 E4
      [87.31, 130.81, 174.61, 261.63], // F2 C3 F3 C4
    ];
    let idx = 0;
    const play = () => {
      // Fade old voices out.
      const old = this.ambientOsc;
      this.ambientOsc = [];
      for (const o of old) {
        try {
          o.stop(ctx.currentTime + 3);
        } catch {
          /* already stopped */
        }
      }
      const chord = chords[idx % chords.length] ?? [];
      idx++;
      for (const f of chord) {
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.value = f;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, ctx.currentTime);
        g.gain.linearRampToValueAtTime(0.22, ctx.currentTime + 2.5);
        g.gain.setTargetAtTime(0.14, ctx.currentTime + 5, 2);
        osc.connect(g);
        if (this.ambientGain) g.connect(this.ambientGain);
        osc.start();
        this.ambientOsc.push(osc);
      }
    };
    play();
    this.ambientTimer = setInterval(play, 9000);
  }

  // ---------- SFX helpers ----------

  private tone(
    freq: number,
    dur: number,
    type: OscillatorType,
    vol: number,
    delay = 0,
    endFreq?: number
  ): void {
    if (!this.ctx || !this.master || this.muted) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (endFreq !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  private noise(dur: number, vol: number, filterFreq: number, type: BiquadFilterType, delay = 0): void {
    if (!this.ctx || !this.master || this.muted) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime + delay;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = filterFreq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(this.master);
    src.start(t0);
  }

  // ---------- game SFX ----------

  click(): void {
    this.tone(750, 0.06, 'sine', 0.12);
  }

  creak(): void {
    this.tone(120, 0.5, 'sawtooth', 0.05, 0, 70);
    this.tone(95, 0.45, 'sawtooth', 0.04, 0.18, 55);
  }

  crack(): void {
    this.noise(0.16, 0.5, 2200, 'highpass');
    this.tone(90, 0.3, 'square', 0.12, 0.02, 40);
  }

  rumble(): void {
    this.noise(1.1, 0.35, 180, 'lowpass');
  }

  splash(): void {
    this.noise(0.5, 0.3, 1200, 'bandpass', 0.02);
  }

  chime(): void {
    this.tone(660, 0.25, 'sine', 0.18);
    this.tone(880, 0.4, 'sine', 0.18, 0.14);
  }

  honk(): void {
    this.tone(233, 0.16, 'square', 0.1, 0.35);
    this.tone(233, 0.28, 'square', 0.1, 0.56);
  }
}

export const sound = new SoundManager();
