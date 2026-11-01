import { COLS, CONFIG, DEATH_COL, VISIBLE_ROWS } from '../config';
import type { ChainStep } from '../core/chain';
import { CHILD_DX, Field, clampPlacement, type Move, type Rotation } from '../core/field';
import type { TurnResult } from '../core/game';
import type { Pair } from '../core/tsumo';
import { clearGemCache, drawSparkle, gemSprite, gemStyle } from './gems';

export interface TurnAnimation {
  turn: TurnResult;
  /** 設置前の盤面 */
  before: Field;
  /** frames[0]: 設置直後 / frames[i]: i連鎖目の消去・落下後 */
  frames: Field[];
  start: number;
}

export interface Cursor {
  x: number;
  rot: Rotation;
}

export interface RenderState {
  field: Field;
  anim: TurnAnimation | null;
  current: Pair | null;
  cursor: Cursor;
  nexts: Pair[];
  /** 置き先プレビューを出すか */
  ghost: boolean;
  /** 指が盤面の外にあり、離すとキャンセルになる */
  cancelHint: boolean;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  kind: 'shard' | 'spark';
  rot: number;
  vr: number;
}

interface Popup {
  x: number;
  y: number;
  chain: number;
  score: number;
  born: number;
  allClearBonus: boolean;
}

/** 盤面の上の操作ペア表示エリア（軸ぷよは常に中段） */
const SPAWN_ROWS = 3;
const NEXT_W = 1.7;
const GAP = 0.4;
const PAD = 0.3;

const key = (x: number, y: number) => y * COLS + x;

export class Renderer {
  private g: CanvasRenderingContext2D;
  private dpr = 1;
  private w = 0;
  private h = 0;
  /** 1マスの大きさ（CSS px） */
  s = 32;
  private fx = 0;
  private fy = 0;
  private nx = 0;
  private particles: Particle[] = [];
  private popups: Popup[] = [];
  private shakeUntil = 0;
  private shakeAmp = 0;
  private flashUntil = 0;
  private flashStart = 0;
  private bannerText = '';
  private bannerUntil = 0;
  private bannerStart = 0;

  constructor(private canvas: HTMLCanvasElement) {
    this.g = canvas.getContext('2d')!;
    this.resize();
  }

  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = rect.width;
    this.h = rect.height;
    this.canvas.width = Math.round(rect.width * this.dpr);
    this.canvas.height = Math.round(rect.height * this.dpr);
    const unitsW = COLS + GAP + NEXT_W + PAD * 2;
    const unitsH = VISIBLE_ROWS + SPAWN_ROWS + PAD * 2;
    this.s = Math.max(8, Math.floor(Math.min(this.w / unitsW, this.h / unitsH)));
    const contentW = this.s * (COLS + GAP + NEXT_W);
    const contentH = this.s * (VISIBLE_ROWS + SPAWN_ROWS);
    this.fx = Math.round((this.w - contentW) / 2);
    this.fy = Math.round((this.h - contentH) / 2 + this.s * SPAWN_ROWS);
    this.nx = this.fx + this.s * (COLS + GAP);
    clearGemCache();
  }

  /** ネクスト列の下端あたり（CSS px、canvas 基準）。1手戻すボタンの配置に使う */
  sideSlot(): { left: number; bottom: number; width: number } {
    return { left: this.nx, bottom: this.fy + this.s * VISIBLE_ROWS, width: this.s * NEXT_W };
  }

  /** 盤面から十分離れた位置か（ここで離すとキャンセル）。上方向は子ぷよの向き操作に使うので含めない */
  isOutside(clientX: number, clientY: number): boolean {
    const rect = this.canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const s = this.s;
    return x < this.fx - s || x > this.fx + s * (COLS + 1) || y > this.fy + s * (VISIBLE_ROWS + 0.5);
  }

  /** 画面座標から列（0〜5）を求める。盤面の外なら null */
  columnAt(clientX: number, clientY: number): number | null {
    const rect = this.canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    if (y < this.fy - this.s * SPAWN_ROWS - this.s || y > this.fy + this.s * VISIBLE_ROWS + this.s) return null;
    if (x < this.fx - this.s * 0.6 || x > this.fx + this.s * (COLS + 0.2)) return null;
    return Math.min(COLS - 1, Math.max(0, Math.floor((x - this.fx) / this.s)));
  }

  private cellX(x: number): number {
    return this.fx + x * this.s;
  }
  private cellY(y: number): number {
    return this.fy + (VISIBLE_ROWS - 1 - y) * this.s;
  }

  // ---------- エフェクトのきっかけ（アプリから呼ぶ） ----------

  onPop(step: ChainStep, now: number): void {
    const s = this.s;
    let sx = 0;
    let sy = 0;
    step.cleared.forEach((c, i) => {
      const px = this.cellX(c.x) + s / 2;
      const py = this.cellY(c.y) + s / 2;
      sx += px;
      sy += py;
      const st = gemStyle(step.clearedColors[i]);
      const shards = 5 + Math.min(step.chain, 10);
      for (let k = 0; k < shards; k++) {
        const a = Math.random() * Math.PI * 2;
        const v = (0.6 + Math.random() * 1.6) * s * (1 + step.chain * 0.08);
        this.particles.push({
          x: px,
          y: py,
          vx: Math.cos(a) * v,
          vy: Math.sin(a) * v - s * 1.2,
          life: 0,
          maxLife: 0.45 + Math.random() * 0.4,
          size: s * (0.08 + Math.random() * 0.1),
          color: Math.random() < 0.35 ? st.light : st.mid,
          kind: 'shard',
          rot: Math.random() * Math.PI,
          vr: (Math.random() - 0.5) * 20,
        });
      }
      for (let k = 0; k < 2; k++) {
        this.particles.push({
          x: px + (Math.random() - 0.5) * s,
          y: py + (Math.random() - 0.5) * s,
          vx: (Math.random() - 0.5) * s,
          vy: -s * (0.5 + Math.random()),
          life: 0,
          maxLife: 0.5 + Math.random() * 0.3,
          size: s * (0.15 + Math.random() * 0.12),
          color: '#fff',
          kind: 'spark',
          rot: 0,
          vr: 0,
        });
      }
    });
    const n = step.cleared.length;
    this.popups.push({ x: sx / n, y: sy / n, chain: step.chain, score: step.score, born: now, allClearBonus: step.allClearBonusApplied });
    // 揺れは控えめに: 連鎖数に比例して少しずつ強くし、上限を低めに抑える
    this.shakeAmp = Math.min(s * 0.16, s * (0.015 + 0.008 * step.chain));
    this.shakeUntil = now + 90 + Math.min(step.chain, 10) * 12;
    if (step.chain >= 7) {
      this.flashStart = now;
      this.flashUntil = now + 90 + step.chain * 8;
    }
  }

  banner(text: string, now: number, ms = 900): void {
    this.bannerText = text;
    this.bannerStart = now;
    this.bannerUntil = now + ms;
  }

  clearEffects(): void {
    this.particles = [];
    this.popups = [];
    this.shakeUntil = 0;
    this.flashUntil = 0;
    this.bannerUntil = 0;
  }

  // ---------- 描画 ----------

  render(st: RenderState, now: number, dt: number): void {
    const g = this.g;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.clearRect(0, 0, this.w, this.h);

    let ox = 0;
    let oy = 0;
    if (now < this.shakeUntil) {
      const k = (this.shakeUntil - now) / 250;
      ox = (Math.random() - 0.5) * this.shakeAmp * Math.min(1, k) * 2;
      oy = (Math.random() - 0.5) * this.shakeAmp * Math.min(1, k) * 2;
    }
    g.save();
    g.translate(ox, oy);

    this.drawWell(now);

    // 盤面
    g.save();
    g.beginPath();
    g.rect(this.fx, this.fy, this.s * COLS, this.s * VISIBLE_ROWS);
    g.clip();
    if (st.anim) this.drawAnimation(st.anim, now);
    else this.drawStatic(st.field, now);
    if (!st.anim && st.ghost && st.current && !st.cancelHint) this.drawGhost(st.field, st.current, st.cursor);
    g.restore();

    // 操作中のペア
    if (!st.anim && st.current) this.drawCurrent(st.current, st.cursor, now);
    if (st.cancelHint) this.drawCancelHint();
    this.drawNext(st.nexts);

    this.updateParticles(dt);
    this.drawParticles();
    this.drawPopups(now);
    g.restore();

    if (now < this.flashUntil) {
      const p = (now - this.flashStart) / (this.flashUntil - this.flashStart);
      g.fillStyle = `rgba(255,255,255,${0.22 * (1 - p)})`;
      g.fillRect(0, 0, this.w, this.h);
    }
    this.drawBanner(now);
  }

  private drawWell(now: number): void {
    const g = this.g;
    const s = this.s;
    const x = this.fx;
    const y = this.fy;
    const w = s * COLS;
    const h = s * VISIBLE_ROWS;

    // 宝石箱のベルベット
    const bg = g.createLinearGradient(0, y, 0, y + h);
    bg.addColorStop(0, '#1a1830');
    bg.addColorStop(1, '#100f1f');
    g.fillStyle = bg;
    g.fillRect(x, y, w, h);
    // 列のうっすらした区切り
    g.strokeStyle = 'rgba(180,170,230,0.05)';
    g.lineWidth = 1;
    for (let c = 1; c < COLS; c++) {
      g.beginPath();
      g.moveTo(x + c * s + 0.5, y);
      g.lineTo(x + c * s + 0.5, y + h);
      g.stroke();
    }
    // 窒息点のマーク
    const dx = this.cellX(DEATH_COL) + s / 2;
    const dy = this.cellY(VISIBLE_ROWS - 1) + s / 2;
    const r = s * 0.18;
    g.strokeStyle = `rgba(255,110,140,${0.35 + 0.1 * Math.sin(now / 400)})`;
    g.lineWidth = Math.max(1.5, s * 0.05);
    g.beginPath();
    g.moveTo(dx - r, dy - r);
    g.lineTo(dx + r, dy + r);
    g.moveTo(dx + r, dy - r);
    g.lineTo(dx - r, dy + r);
    g.stroke();
    // 枠
    g.strokeStyle = 'rgba(214,190,140,0.55)';
    g.lineWidth = 1.5;
    g.strokeRect(x - 1, y - 1, w + 2, h + 2);
    // 出現エリアの床線
    g.strokeStyle = 'rgba(214,190,140,0.18)';
    g.setLineDash([3, 5]);
    g.beginPath();
    g.moveTo(x, y - 0.5);
    g.lineTo(x + w, y - 0.5);
    g.stroke();
    g.setLineDash([]);
  }

  private drawGem(color: number, px: number, py: number, scale = 1, alpha = 1): void {
    const s = this.s;
    const size = Math.round(s * this.dpr);
    const sprite = gemSprite(color, size);
    const g = this.g;
    if (alpha !== 1) g.globalAlpha = alpha;
    const d = s * scale;
    g.drawImage(sprite, px + (s - d) / 2, py + (s - d) / 2, d, d);
    if (alpha !== 1) g.globalAlpha = 1;
  }

  /** 隣り合う同色の宝石をつなぐ光の帯 */
  private drawLinks(field: Field, skip: Set<number>): void {
    const g = this.g;
    const s = this.s;
    for (let x = 0; x < COLS; x++) {
      const h = Math.min(field.height(x), VISIBLE_ROWS);
      for (let y = 0; y < h; y++) {
        if (skip.has(key(x, y))) continue;
        const c = field.get(x, y)!;
        const st = gemStyle(c);
        g.fillStyle = st.mid;
        g.globalAlpha = 0.55;
        if (x + 1 < COLS && y < field.height(x + 1) && field.get(x + 1, y) === c && !skip.has(key(x + 1, y))) {
          g.fillRect(this.cellX(x) + s / 2, this.cellY(y) + s * 0.32, s, s * 0.36);
        }
        if (y + 1 < h && field.get(x, y + 1) === c && !skip.has(key(x, y + 1))) {
          g.fillRect(this.cellX(x) + s * 0.32, this.cellY(y + 1) + s / 2, s * 0.36, s);
        }
        g.globalAlpha = 1;
      }
    }
  }

  private drawStatic(field: Field, now: number, skip = new Set<number>(), popping?: Map<number, number>): void {
    this.drawLinks(field, popping ? new Set([...skip, ...popping.keys()]) : skip);
    for (let x = 0; x < COLS; x++) {
      const h = Math.min(field.height(x), VISIBLE_ROWS);
      for (let y = 0; y < h; y++) {
        const k = key(x, y);
        if (skip.has(k)) continue;
        const c = field.get(x, y)!;
        const px = this.cellX(x);
        const py = this.cellY(y);
        const p = popping?.get(k);
        if (p !== undefined) {
          this.drawPopping(c, px, py, p);
          continue;
        }
        this.drawGem(c, px, py);
        // ときどき走るきらめき
        const phase = ((x * 7.13 + y * 3.71 + c * 1.9) % 4.7) * 1000;
        const t = (now + phase) % 4200;
        if (t < 260) {
          const a = Math.sin((t / 260) * Math.PI);
          drawSparkle(this.g, px + this.s * 0.3, py + this.s * 0.28, this.s * 0.22, a * 0.9);
        }
      }
    }
  }

  private drawPopping(color: number, px: number, py: number, p: number): void {
    // 膨らんで白く光り、砕ける
    const scale = p < 0.5 ? 1 + p * 0.5 : 1.25 * (1 - (p - 0.5) * 2);
    this.drawGem(color, px, py, Math.max(0, scale), 1);
    const g = this.g;
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = Math.sin(Math.min(1, p * 1.4) * Math.PI) * 0.8;
    const r = this.s * 0.5 * Math.max(0.1, scale);
    const grad = g.createRadialGradient(px + this.s / 2, py + this.s / 2, 0, px + this.s / 2, py + this.s / 2, r);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(px - this.s * 0.2, py - this.s * 0.2, this.s * 1.4, this.s * 1.4);
    g.restore();
  }

  private drawMovers(moves: Move[], elapsed: number, msPerRow: number): void {
    for (const m of moves) {
      if (m.vanished) continue;
      const fallen = msPerRow > 0 ? elapsed / msPerRow : Infinity;
      const y = Math.max(m.toY, m.fromY - fallen);
      this.drawGem(m.color, this.cellX(m.x), this.fy + (VISIBLE_ROWS - 1 - y) * this.s);
    }
  }

  private drawAnimation(anim: TurnAnimation, now: number): void {
    const e = now - anim.start;
    const tl = anim.turn.timeline;
    if (e < tl.placeEnd) {
      this.drawStatic(anim.before, now);
      this.g.save();
      this.drawMovers(anim.turn.placeMoves, e, CONFIG.PLACE_FALL_MS_PER_ROW);
      this.g.restore();
      return;
    }
    const steps = anim.turn.chain.steps;
    for (let i = 0; i < steps.length; i++) {
      const t = tl.steps[i];
      const frame = anim.frames[i];
      if (e < t.popStart) {
        this.drawStatic(frame, now);
        return;
      }
      if (e < t.fallStart) {
        const p = CONFIG.CHAIN_POP_MS > 0 ? (e - t.popStart) / CONFIG.CHAIN_POP_MS : 1;
        const popping = new Map(steps[i].cleared.map((c) => [key(c.x, c.y), p] as [number, number]));
        this.drawStatic(frame, now, new Set(), popping);
        return;
      }
      if (e < t.fallEnd) {
        const skip = new Set(steps[i].cleared.map((c) => key(c.x, c.y)));
        for (const m of steps[i].falls) skip.add(key(m.x, m.fromY));
        this.drawStatic(frame, now, skip);
        this.drawMovers(steps[i].falls, e - t.fallStart, CONFIG.CHAIN_FALL_MS_PER_ROW);
        return;
      }
    }
    this.drawStatic(anim.frames[anim.frames.length - 1], now);
  }

  private pairCells(cursor: Cursor): { ax: number; cx: number } {
    const ax = clampPlacement(cursor.x, cursor.rot);
    return { ax, cx: ax + CHILD_DX[cursor.rot] };
  }

  private drawGhost(field: Field, pair: Pair, cursor: Cursor): void {
    const probe = field.clone();
    const moves = probe.place(pair, cursor.x, cursor.rot);
    for (const m of moves) {
      if (m.vanished || m.toY >= VISIBLE_ROWS) continue;
      const px = this.cellX(m.x);
      const py = this.cellY(m.toY);
      this.drawGem(m.color, px, py, 0.9, 0.32);
      this.g.strokeStyle = 'rgba(255,255,255,0.35)';
      this.g.lineWidth = 1;
      this.g.beginPath();
      this.g.arc(px + this.s / 2, py + this.s / 2, this.s * 0.44, 0, Math.PI * 2);
      this.g.stroke();
    }
  }

  private drawCurrent(pair: Pair, cursor: Cursor, now: number): void {
    const s = this.s;
    const { ax, cx } = this.pairCells(cursor);
    // 軸ぷよは常に中段に固定し、子ぷよだけを向きに応じて上下左右に出す
    const axisY = this.fy - 2 * s;
    const childY = cursor.rot === 0 ? axisY - s : cursor.rot === 2 ? axisY + s : axisY;
    this.drawGem(pair.child, this.cellX(cx), childY);
    this.drawGem(pair.axis, this.cellX(ax), axisY);
    // 軸ぷよの目印
    const g = this.g;
    g.strokeStyle = `rgba(255,236,190,${0.65 + 0.25 * Math.sin(now / 180)})`;
    g.lineWidth = Math.max(1.5, s * 0.06);
    g.beginPath();
    g.arc(this.cellX(ax) + s / 2, axisY + s / 2, s * 0.49, 0, Math.PI * 2);
    g.stroke();
  }

  private drawCancelHint(): void {
    const g = this.g;
    const s = this.s;
    const cx = this.fx + (s * COLS) / 2;
    const cy = this.fy + s * 3;
    g.save();
    g.fillStyle = 'rgba(14,13,26,0.82)';
    g.strokeStyle = 'rgba(255,143,168,0.8)';
    g.lineWidth = 1.5;
    const w = s * 4.6;
    const h = s * 1.5;
    g.beginPath();
    g.roundRect(cx - w / 2, cy - h / 2, w, h, s * 0.25);
    g.fill();
    g.stroke();
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#ff8fa8';
    g.font = `700 ${Math.round(s * 0.42)}px "Zen Kaku Gothic New", sans-serif`;
    g.fillText('× 離すとキャンセル', cx, cy);
    g.restore();
  }

  private drawNext(nexts: Pair[]): void {
    const g = this.g;
    const s = this.s;
    g.fillStyle = 'rgba(214,190,140,0.75)';
    g.font = `600 ${Math.max(10, Math.round(s * 0.34))}px "Chakra Petch", "Zen Kaku Gothic New", sans-serif`;
    g.textAlign = 'left';
    g.textBaseline = 'top';
    g.fillText('NEXT', this.nx, this.fy - s * SPAWN_ROWS);
    let y = this.fy - s * (SPAWN_ROWS - 0.55);
    nexts.forEach((p, i) => {
      const scale = i === 0 ? 1 : 0.72;
      const ps = s * scale;
      const x = this.nx + (i === 0 ? 0 : s * 0.1);
      g.fillStyle = 'rgba(30,28,56,0.8)';
      g.fillRect(x - 3, y - 3, ps + 6, ps * 2 + 6);
      this.drawGemSized(p.child, x, y, ps);
      this.drawGemSized(p.axis, x, y + ps, ps);
      y += ps * 2 + s * 0.45;
    });
  }

  private drawGemSized(color: number, x: number, y: number, size: number): void {
    const sprite = gemSprite(color, Math.round(this.s * this.dpr));
    this.g.drawImage(sprite, x, y, size, size);
  }

  private updateParticles(dt: number): void {
    const sec = dt / 1000;
    for (const p of this.particles) {
      p.life += sec;
      p.x += p.vx * sec;
      p.y += p.vy * sec;
      if (p.kind === 'shard') p.vy += this.s * 9 * sec;
      p.vx *= 1 - 1.5 * sec;
      p.rot += p.vr * sec;
    }
    this.particles = this.particles.filter((p) => p.life < p.maxLife);
  }

  private drawParticles(): void {
    const g = this.g;
    for (const p of this.particles) {
      const a = 1 - p.life / p.maxLife;
      if (p.kind === 'spark') {
        drawSparkle(g, p.x, p.y, p.size * (0.6 + a * 0.6), a);
        continue;
      }
      g.save();
      g.globalAlpha = a;
      g.translate(p.x, p.y);
      g.rotate(p.rot);
      g.fillStyle = p.color;
      g.beginPath();
      g.moveTo(0, -p.size);
      g.lineTo(p.size * 0.6, 0);
      g.lineTo(0, p.size);
      g.lineTo(-p.size * 0.6, 0);
      g.closePath();
      g.fill();
      g.restore();
    }
  }

  private drawPopups(now: number): void {
    const g = this.g;
    const s = this.s;
    const LIFE = 700;
    this.popups = this.popups.filter((p) => now - p.born < LIFE);
    for (const p of this.popups) {
      const t = (now - p.born) / LIFE;
      const a = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
      const rise = s * 0.8 * Math.sqrt(t);
      const big = Math.min(1.9, 0.9 + p.chain * 0.07);
      const pop = t < 0.12 ? 0.6 + (t / 0.12) * 0.4 : 1;
      const x = Math.min(Math.max(p.x, this.fx + s * 1.6), this.fx + s * (COLS - 1.6));
      const y = p.y - rise;
      g.save();
      g.globalAlpha = a;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = `400 ${Math.round(s * 0.62 * big * pop)}px "Dela Gothic One", "Zen Kaku Gothic New", sans-serif`;
      g.lineWidth = Math.max(2, s * 0.12);
      g.strokeStyle = 'rgba(10,8,24,0.85)';
      g.fillStyle = p.chain >= 10 ? '#ffe28a' : p.chain >= 5 ? '#ffd0f0' : '#ffffff';
      const label = `${p.chain}連鎖`;
      g.strokeText(label, x, y);
      g.fillText(label, x, y);
      g.font = `600 ${Math.round(s * 0.36)}px "Chakra Petch", sans-serif`;
      const sc = `+${p.score.toLocaleString('en-US')}`;
      g.strokeText(sc, x, y + s * 0.55 * big);
      g.fillStyle = '#d8f6ff';
      g.fillText(sc, x, y + s * 0.55 * big);
      if (p.allClearBonus) {
        g.fillStyle = '#9fffd6';
        g.strokeText('ALL CLEAR BONUS', x, y + s * 0.95 * big);
        g.fillText('ALL CLEAR BONUS', x, y + s * 0.95 * big);
      }
      g.restore();
    }
  }

  private drawBanner(now: number): void {
    if (now >= this.bannerUntil) return;
    const g = this.g;
    const s = this.s;
    const t = (now - this.bannerStart) / (this.bannerUntil - this.bannerStart);
    const a = t < 0.15 ? t / 0.15 : t > 0.75 ? (1 - t) / 0.25 : 1;
    const cx = this.fx + (s * COLS) / 2;
    const cy = this.fy + (s * VISIBLE_ROWS) * 0.42;
    g.save();
    g.globalAlpha = Math.max(0, a);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `400 ${Math.round(s * 0.8)}px "Dela Gothic One", sans-serif`;
    g.lineWidth = s * 0.16;
    g.strokeStyle = 'rgba(10,8,24,0.9)';
    g.fillStyle = '#ffe9a8';
    g.strokeText(this.bannerText, cx, cy);
    g.fillText(this.bannerText, cx, cy);
    g.restore();
  }
}
