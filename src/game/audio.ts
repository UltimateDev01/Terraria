/* Small WebAudio synth — procedural SFX + ambient pad. No audio assets. */

export class Sfx {
  ctx: AudioContext | null = null;
  master: GainNode | null = null;
  musicGain: GainNode | null = null;
  sfxGain: GainNode | null = null;
  noiseBuf: AudioBuffer | null = null;
  musicOn = true;
  private timer: number | null = null;
  private step = 0;

  init() {
    if (this.ctx) return;
    try {
      const AC = (window.AudioContext || (window as any).webkitAudioContext);
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.9;
      this.master.connect(this.ctx.destination);
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.connect(this.master);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.0;
      this.musicGain.connect(this.master);
      const len = Math.floor(this.ctx.sampleRate * 0.5);
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.noiseBuf = buf;
    } catch {
      this.ctx = null;
    }
  }
  resume() {
    this.init();
    if (this.ctx && this.ctx.state === "suspended") void this.ctx.resume();
  }
  setVolumes(sfx: number, music: number) {
    this.init();
    if (this.sfxGain) this.sfxGain.gain.value = sfx;
    if (this.musicGain) this.musicGain.gain.value = music * 0.5;
    this.musicOn = music > 0.001;
    if (this.musicOn) this.startMusic();
    else this.stopMusic();
  }
  private tone(freq: number, dur: number, type: OscillatorType, vol: number, slide = 0, dest?: AudioNode) {
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(dest ?? this.sfxGain);
    o.start(t);
    o.stop(t + dur + 0.02);
  }
  private noise(dur: number, vol: number, freq: number, q = 1, sweep = 0) {
    if (!this.ctx || !this.noiseBuf || !this.sfxGain) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.setValueAtTime(freq, t);
    f.Q.value = q;
    if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(60, freq * sweep), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.sfxGain);
    src.start(t); src.stop(t + dur + 0.02);
  }

  play(name: string, pitch = 1) {
    if (!this.ctx) return;
    switch (name) {
      case "dig": this.noise(0.07, 0.32, 380 + Math.random() * 220, 1.2, 0.6); break;
      case "digsoft": this.noise(0.05, 0.16, 220 + Math.random() * 120, 1.5, 0.7); break;
      case "break": this.noise(0.22, 0.5, 700, 0.7, 0.25); this.tone(160, 0.16, "triangle", 0.16, -60); break;
      case "place": this.tone(320 * pitch, 0.07, "square", 0.11, 120); this.noise(0.05, 0.14, 900, 2); break;
      case "swing": this.noise(0.13, 0.24, 1500, 0.8, 0.35); break;
      case "hit": this.noise(0.09, 0.4, 500, 1.1, 0.4); this.tone(200, 0.1, "sawtooth", 0.16, -90); break;
      case "crit": this.tone(880, 0.12, "square", 0.16, -500); this.noise(0.1, 0.3, 1200, 1, 0.3); break;
      case "bow": this.noise(0.09, 0.28, 1800, 2.2, 0.35); this.tone(520, 0.05, "triangle", 0.07, -180); break;
      case "magic": this.tone(660 * pitch, 0.24, "sine", 0.16, 520); this.tone(990 * pitch, 0.18, "sine", 0.08, -300); break;
      case "hurt": this.tone(240, 0.2, "square", 0.2, -140); this.noise(0.14, 0.26, 320, 1, 0.5); break;
      case "die": this.tone(300, 0.7, "sawtooth", 0.22, -250); this.noise(0.6, 0.2, 200, 0.8, 0.3); break;
      case "pickup": this.tone(880 * pitch, 0.07, "triangle", 0.1, 260); break;
      case "craft": this.tone(520, 0.1, "square", 0.12, 220); this.tone(780, 0.12, "square", 0.1, 260); break;
      case "chest": this.noise(0.2, 0.24, 480, 1.4, 0.5); this.tone(300, 0.24, "triangle", 0.12, 160); break;
      case "jump": this.tone(420, 0.08, "triangle", 0.09, 200); break;
      case "splash": this.noise(0.3, 0.28, 900, 0.8, 0.3); break;
      case "error": this.tone(180, 0.1, "square", 0.1, -60); break;
      case "roar": this.tone(90, 0.9, "sawtooth", 0.3, -40); this.noise(0.9, 0.34, 240, 0.6, 0.4); break;
      case "slam": this.noise(0.4, 0.5, 160, 0.5, 0.3); this.tone(70, 0.4, "sine", 0.3, -20); break;
      case "ui": this.tone(1100, 0.04, "square", 0.05, 200); break;
      default: this.noise(0.05, 0.14, 700, 1.4);
    }
  }

  /* --- generative ambient pad --- */
  private nodes: { o: OscillatorNode; g: GainNode }[] = [];
  startMusic() {
    if (!this.ctx || !this.musicGain || this.nodes.length) return;
    const roots = [110, 146.83, 164.81, 196];
    for (let i = 0; i < 4; i++) {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = i % 2 ? "sine" : "triangle";
      o.frequency.value = roots[i % roots.length] * (i === 3 ? 2 : 1);
      g.gain.value = 0.05 + i * 0.008;
      const lfo = this.ctx.createOscillator();
      const lg = this.ctx.createGain();
      lfo.frequency.value = 0.03 + i * 0.017;
      lg.gain.value = 0.04;
      lfo.connect(lg); lg.connect(g.gain);
      o.connect(g); g.connect(this.musicGain);
      o.start(); lfo.start();
      this.nodes.push({ o, g });
    }
    if (this.timer == null) {
      this.timer = window.setInterval(() => this.musicTick(), 2100);
    }
  }
  private musicTick() {
    if (!this.ctx || !this.musicGain || !this.musicOn) return;
    const scales = [[0, 3, 5, 7, 10], [0, 2, 4, 7, 9], [0, 2, 5, 7, 10]];
    const sc = scales[this.step % scales.length];
    const n = sc[(Math.random() * sc.length) | 0] + 12 * (Math.random() < 0.4 ? 2 : 1);
    const f = 220 * Math.pow(2, n / 12);
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = "triangle";
    o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.06, t + 0.25);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.9);
    const d = this.ctx.createDelay();
    d.delayTime.value = 0.31;
    const fb = this.ctx.createGain();
    fb.gain.value = 0.3;
    o.connect(g); g.connect(this.musicGain); g.connect(d); d.connect(fb); fb.connect(d); d.connect(this.musicGain);
    o.start(t); o.stop(t + 2.1);
    this.step++;
  }
  stopMusic() {
    if (this.timer != null) { clearInterval(this.timer); this.timer = null; }
    for (const n of this.nodes) { try { n.o.stop(); } catch { /* noop */ } }
    this.nodes = [];
  }
}
export const sfx = new Sfx();
