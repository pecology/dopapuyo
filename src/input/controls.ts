import { COLS, CONFIG } from '../config';
import type { Rotation } from '../core/field';
import type { ControlScheme } from '../storage';

export interface ControlHandlers {
  /** ゲーム操作を受け付けられる状態か */
  canControl(): boolean;
  move(dx: number): boolean;
  moveToWall(dx: number): void;
  rotate(dir: 1 | -1): void;
  setRotation(rot: Rotation): void;
  /** 現在のカーソル位置に置く */
  place(): void;
  /** 列を指定して置く（向きは現在のもの） */
  placeAt(col: number): void;
  /** タッチ/マウスのプレビュー（列と向き）。outside は「離すとキャンセル」の位置にいるか */
  preview(col: number, rot: Rotation, outside: boolean): void;
  /** タッチ/マウスの操作が取り消された */
  cancelled(): void;
  pointerPlace(col: number, rot: Rotation): void;
  /** 1手戻す（ペナルティ付き） */
  undo(): void;
  retry(): void;
  newSeed(): void;
  menu(): void;
  start(): void;
}

const DIRECT_COLUMNS = ['KeyH', 'KeyJ', 'KeyK', 'KeyL', 'Semicolon', 'Quote'];
const DIRECT_ROT: Record<string, Rotation> = { KeyW: 0, KeyD: 1, KeyS: 2, KeyA: 3 };

/** キーボード入力。矢印キー方式は独自の DAS/ARR で長押し移動する */
export class Keyboard {
  scheme: ControlScheme = 'arrow';
  private held: { dir: -1 | 1; since: number; last: number; charged: boolean } | null = null;

  constructor(private h: ControlHandlers) {
    window.addEventListener('keydown', (e) => this.onDown(e));
    window.addEventListener('keyup', (e) => this.onUp(e));
    window.addEventListener('blur', () => (this.held = null));
  }

  private onDown(e: KeyboardEvent): void {
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'SELECT')) return;
    // フォーカス中のボタンは Enter / Space でそのボタン自身を押す
    if (target?.tagName === 'BUTTON' && (e.code === 'Enter' || e.code === 'Space')) return;

    switch (e.code) {
      case 'KeyQ':
      case 'Backspace':
        e.preventDefault();
        if (!e.repeat) this.h.undo();
        return;
      case 'KeyR':
        e.preventDefault();
        if (!e.repeat) this.h.retry();
        return;
      case 'KeyN':
        e.preventDefault();
        if (!e.repeat) this.h.newSeed();
        return;
      case 'Escape':
        e.preventDefault();
        this.h.menu();
        return;
      case 'Enter':
      case 'Space':
        if (!e.repeat) this.h.start();
        e.preventDefault();
        return;
    }

    if (e.repeat) {
      if (e.code.startsWith('Arrow')) e.preventDefault();
      return;
    }

    if (this.scheme === 'arrow') {
      switch (e.code) {
        case 'ArrowLeft':
        case 'ArrowRight': {
          e.preventDefault();
          const dir = e.code === 'ArrowLeft' ? -1 : 1;
          const now = performance.now();
          this.held = { dir, since: now, last: now, charged: false };
          if (this.h.canControl()) this.h.move(dir);
          return;
        }
        case 'KeyZ':
          if (this.h.canControl()) this.h.rotate(-1);
          return;
        case 'KeyX':
          if (this.h.canControl()) this.h.rotate(1);
          return;
        case 'ArrowDown':
        case 'ArrowUp':
          e.preventDefault();
          if (this.h.canControl()) this.h.place();
          return;
      }
    } else {
      if (e.code in DIRECT_ROT) {
        if (this.h.canControl()) this.h.setRotation(DIRECT_ROT[e.code]);
        return;
      }
      const col = DIRECT_COLUMNS.indexOf(e.code);
      if (col >= 0) {
        e.preventDefault();
        if (this.h.canControl()) this.h.placeAt(col);
      }
    }
  }

  private onUp(e: KeyboardEvent): void {
    if (!this.held) return;
    if ((e.code === 'ArrowLeft' && this.held.dir === -1) || (e.code === 'ArrowRight' && this.held.dir === 1)) {
      this.held = null;
    }
  }

  /** 毎フレーム呼ぶ（長押しの連続移動） */
  update(now: number): void {
    const held = this.held;
    if (!held || this.scheme !== 'arrow' || !this.h.canControl()) return;
    if (!held.charged) {
      if (now - held.since < CONFIG.DAS_MS) return;
      held.charged = true;
      held.last = now - CONFIG.ARR_MS;
    }
    if (CONFIG.ARR_MS <= 0) {
      this.h.moveToWall(held.dir);
      return;
    }
    let guard = COLS;
    while (now - held.last >= CONFIG.ARR_MS && guard-- > 0) {
      held.last += CONFIG.ARR_MS;
      if (!this.h.move(held.dir)) {
        held.last = now;
        break;
      }
    }
  }
}

/**
 * タッチ／マウス: タップした列＝軸ぷよの列、フリック方向＝子ぷよの向き。
 * 指を置いている間はプレビュー、離した時点で設置。
 * 取り消し: 盤面の外まで引っぱって離す／2本目の指でタップ／右クリック。
 */
export class Pointer {
  threshold = 24;
  private active: { id: number; x0: number; y0: number; col: number; rot: Rotation; outside: boolean } | null = null;
  /** キャンセルに使った指（離したときに何もしないよう覚えておく） */
  private ignored = new Set<number>();

  constructor(
    canvas: HTMLCanvasElement,
    private columnAt: (cx: number, cy: number) => number | null,
    private isOutside: (cx: number, cy: number) => boolean,
    private h: ControlHandlers,
  ) {
    canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.cancel();
    });
    canvas.addEventListener('pointerdown', (e) => {
      // 操作中にもう1本の指・右クリックが来たらキャンセル
      if (this.active) {
        e.preventDefault();
        this.ignored.add(e.pointerId);
        this.cancel();
        return;
      }
      if (e.button === 2) return;
      if (!this.h.canControl()) return;
      const col = this.columnAt(e.clientX, e.clientY);
      if (col === null) return;
      e.preventDefault();
      canvas.setPointerCapture(e.pointerId);
      this.active = { id: e.pointerId, x0: e.clientX, y0: e.clientY, col, rot: 0, outside: false };
      this.h.preview(col, 0, false);
    });
    canvas.addEventListener('pointermove', (e) => {
      const a = this.active;
      if (!a || a.id !== e.pointerId) return;
      // 左ボタンを押したまま右ボタンを押した（同じマウスなので pointerdown ではなく move で届く）
      if (e.pointerType === 'mouse' && e.buttons & 2) {
        this.cancel();
        return;
      }
      a.outside = this.isOutside(e.clientX, e.clientY);
      a.rot = this.rotationFor(e.clientX - a.x0, e.clientY - a.y0);
      this.h.preview(a.col, a.rot, a.outside);
    });
    const finish = (e: PointerEvent, commit: boolean) => {
      if (this.ignored.delete(e.pointerId)) return;
      const a = this.active;
      if (!a || a.id !== e.pointerId) return;
      this.active = null;
      this.h.preview(a.col, a.rot, false);
      if (commit && !a.outside && this.h.canControl()) this.h.pointerPlace(a.col, a.rot);
    };
    canvas.addEventListener('pointerup', (e) => finish(e, true));
    canvas.addEventListener('pointercancel', (e) => finish(e, false));
  }

  /** 操作中の指を取り消す */
  cancel(): void {
    const a = this.active;
    if (!a) return;
    this.active = null;
    this.ignored.add(a.id);
    this.h.preview(a.col, a.rot, false);
    this.h.cancelled();
  }

  private rotationFor(dx: number, dy: number): Rotation {
    if (Math.hypot(dx, dy) < this.threshold) return 0;
    if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 1 : 3;
    return dy > 0 ? 2 : 0;
  }
}
