// Efeitos sonoros sintetizados com WebAudio (sem arquivos). Volume e mudo persistidos.
export class Audio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  volume = 0.5; muted = false;
  private last = new Map<string, number>();
  constructor() {
    try { this.volume = Number(localStorage.getItem('aoe_volume') ?? 0.5); this.muted = localStorage.getItem('aoe_muted') === '1'; } catch { /* ignore */ }
  }
  private ensure(): boolean {
    if (this.ctx) { if (this.ctx.state === 'suspended') void this.ctx.resume(); return true; }
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AC(); this.master = this.ctx.createGain(); this.master.gain.value = this.muted ? 0 : this.volume; this.master.connect(this.ctx.destination);
      return true;
    } catch { return false; }
  }
  setVolume(v: number) { this.volume = v; if (this.master) this.master.gain.value = this.muted ? 0 : v; try { localStorage.setItem('aoe_volume', String(v)); } catch { /* ignore */ } }
  toggleMute(): boolean { this.muted = !this.muted; if (this.master) this.master.gain.value = this.muted ? 0 : this.volume; try { localStorage.setItem('aoe_muted', this.muted ? '1' : '0'); } catch { /* ignore */ } return this.muted; }

  private tone(freq: number, dur: number, type: OscillatorType = 'sine', gain = 0.2, slide = 0) {
    if (!this.ensure() || !this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.02);
  }
  private noise(dur: number, gain = 0.15, freq = 800) {
    if (!this.ensure() || !this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    const buf = this.ctx.createBuffer(1, Math.floor(this.ctx.sampleRate * dur), this.ctx.sampleRate);
    const d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const s = this.ctx.createBufferSource(); s.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq;
    const g = this.ctx.createGain(); g.gain.value = gain;
    s.connect(f); f.connect(g); g.connect(this.master); s.start(t);
  }
  play(name: string): void {
    const now = performance.now();
    const minGap: Record<string, number> = { attack: 90, hit: 60, select: 40, command: 40, build: 150 };
    const last = this.last.get(name) ?? 0;
    if (now - last < (minGap[name] ?? 30)) return;
    this.last.set(name, now);
    switch (name) {
      case 'select': this.tone(660, 0.06, 'triangle', 0.08); break;
      case 'command': this.tone(440, 0.05, 'square', 0.05); this.tone(560, 0.05, 'square', 0.04); break;
      case 'attack': this.noise(0.08, 0.12, 1200); this.tone(180, 0.08, 'sawtooth', 0.06, -80); break;
      case 'build': this.tone(320, 0.12, 'triangle', 0.1); this.noise(0.1, 0.05, 500); break;
      case 'complete': this.tone(523, 0.12, 'sine', 0.12); this.tone(659, 0.12, 'sine', 0.1); setTimeout(() => this.tone(784, 0.18, 'sine', 0.12), 110); break;
      case 'age': [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.tone(f, 0.35, 'sine', 0.14), i * 140)); break;
      case 'alert': this.tone(880, 0.12, 'square', 0.1); setTimeout(() => this.tone(660, 0.16, 'square', 0.1), 130); break;
      case 'power': this.tone(200, 0.5, 'sawtooth', 0.12, 600); this.noise(0.4, 0.1, 2000); break;
      case 'bolt': this.noise(0.25, 0.25, 4000); this.tone(90, 0.4, 'sawtooth', 0.15, -60); break;
      case 'death': this.tone(240, 0.2, 'triangle', 0.08, -120); break;
      case 'error': this.tone(200, 0.12, 'square', 0.08, -50); break;
      case 'victory': [523, 659, 784, 1046, 1318].forEach((f, i) => setTimeout(() => this.tone(f, 0.5, 'sine', 0.15), i * 160)); break;
      case 'defeat': [400, 350, 300, 220].forEach((f, i) => setTimeout(() => this.tone(f, 0.5, 'sawtooth', 0.1), i * 220)); break;
      case 'coin': this.tone(1200, 0.08, 'sine', 0.08); this.tone(1600, 0.1, 'sine', 0.06); break;
    }
  }
}
