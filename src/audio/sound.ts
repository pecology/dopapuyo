/**
 * 効果音（Web Audio API でその場で合成）。
 * 音はすべてここを通す。将来の BGM 用に bgm バスを用意してある。
 */

// 連鎖ごとに上がっていく音階（ペンタトニック、半音単位）
const CHAIN_STEPS = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28, 31, 33, 36, 38, 40, 43];

class Sound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfx: GainNode | null = null;
  /** 将来の BGM 用 */
  bgm: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private volume = 0.7;

  /** ユーザー操作の中で呼ぶ（ブラウザの自動再生制限のため） */
  unlock(): void {
    if (!this.ctx) {
      try {
        const ctx = new AudioContext();
        this.ctx = ctx;
        this.master = ctx.createGain();
        this.master.connect(ctx.destination);
        this.sfx = ctx.createGain();
        this.sfx.connect(this.master);
        this.bgm = ctx.createGain();
        this.bgm.connect(this.master);
        this.setVolume(this.volume);
        const buf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        this.noise = buf;
      } catch {
        return;
      }
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setVolume(v: number): void {
    this.volume = v;
    if (this.sfx) this.sfx.gain.value = v * 0.6;
  }

  private tone(freq: number, dur: number, type: OscillatorType, gain: number, delay = 0, slideTo?: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfx) return;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.sfx);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private burst(dur: number, freq: number, gain: number, delay = 0): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfx || !this.noise) return;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.sfx);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  move(): void {
    this.tone(1800, 0.025, 'square', 0.03);
  }

  rotate(): void {
    this.tone(1200, 0.04, 'triangle', 0.06, 0, 1600);
  }

  /** 設置音: 短く高い「キィン」 */
  place(): void {
    this.kiin(3520, 0.09, 0.28);
    this.tone(160, 0.05, 'sine', 0.12, 0, 90);
  }

  /**
   * 「キィン」と鳴る金属的・クリスタル的な音。
   * 鐘のような非整数倍音を重ね、アタックを鋭く、余韻を長めにする。
   */
  private kiin(f: number, gain: number, decay: number, delay = 0, rich = 0): void {
    const partials: [number, number][] = [
      [1, 1],
      [2.76, 0.45],
      [5.4, 0.22],
      [8.93, 0.1],
    ];
    if (rich > 0) partials.push([13.34, 0.06 * rich], [1.5, 0.25 * rich]);
    for (const [ratio, amp] of partials) {
      const fr = f * ratio;
      if (fr > 18000) continue;
      // 高い倍音ほど早く減衰させると金属っぽくなる
      this.tone(fr, decay / Math.sqrt(ratio), 'sine', gain * amp, delay);
    }
    // 打撃の瞬間の「チッ」
    this.burst(0.018, 7000, gain * 0.5, delay);
  }

  /** 連鎖の消去音。連鎖数が増えるほど高く、きらびやかに */
  pop(chain: number): void {
    // 高くなりすぎないよう、上限を設ける
    const step = Math.min(24, CHAIN_STEPS[Math.min(chain, CHAIN_STEPS.length) - 1]);
    const f = 1568 * Math.pow(2, step / 12);
    const rich = Math.min(1, (chain - 1) / 6);
    this.kiin(f, 0.2, 0.55 + Math.min(chain, 12) * 0.05, 0, rich);
    // 少し遅れてオクターブ上が重なり、ハモって伸びる
    this.kiin(f * 2, 0.07 + rich * 0.04, 0.4, 0.012);
    if (chain >= 4) this.kiin(f * 1.5, 0.08, 0.5, 0.03);
    if (chain >= 8) this.kiin(f * 3, 0.05, 0.6, 0.05, 1);
    if (chain >= 12) this.burst(0.5, 9000, 0.06, 0.02);
  }

  cancel(): void {
    this.tone(500, 0.06, 'triangle', 0.07, 0, 350);
  }

  undo(): void {
    this.tone(900, 0.12, 'triangle', 0.12, 0, 300);
    this.tone(600, 0.12, 'triangle', 0.08, 0.06, 200);
  }

  allClear(): void {
    [0, 4, 7, 12, 16].forEach((s, i) => this.kiin(1318.5 * Math.pow(2, s / 12), 0.12, 0.6, i * 0.05));
  }

  clear(): void {
    [0, 7, 12, 16, 19, 24].forEach((s, i) => this.kiin(784 * Math.pow(2, s / 12), 0.13, 0.9, i * 0.07, 1));
    this.burst(0.6, 6000, 0.08, 0.35);
  }

  dead(): void {
    this.tone(220, 0.6, 'sawtooth', 0.12, 0, 55);
  }
}

export const sound = new Sound();
