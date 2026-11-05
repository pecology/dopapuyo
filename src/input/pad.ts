import { COLS } from '../config';
import type { Rotation } from '../core/field';
import type { Color, Pair } from '../core/tsumo';
import { gemSprite } from '../render/gems';
import type { ControlHandlers } from './controls';

/** 段の並び（上から）: 縦（子が上）・縦（子が下）・横（子が右）・横（子が左） */
const ROWS: { rot: Rotation; name: string }[] = [
  { rot: 0, name: '縦・子が上' },
  { rot: 2, name: '縦・子が下' },
  { rot: 1, name: '横・子が右' },
  { rot: 3, name: '横・子が左' },
];

interface PadButton {
  el: HTMLButtonElement;
  /** 軸ぷよの列 */
  col: number;
  rot: Rotation;
  axis: HTMLSpanElement;
  child: HTMLSpanElement;
}

/**
 * ボタン方式（タッチ）: 置き方22パターンを1つずつボタンにして、盤面の下に並べる。
 * - ボタンに指を置くと盤面に置き先を表示し、離すと設置
 * - 指を置いたままボタンの外へずらして離すと、置かずに取り消す
 * - 各ボタンには今のペアの色で、置いたときの形を描く
 */
export class ButtonPad {
  enabled = false;
  private buttons: PadButton[] = [];
  private pressed: { id: number; button: PadButton; inside: boolean; before: { col: number; rot: Rotation } } | null =
    null;
  /** 今描いているペア（変わったときだけ描き直す） */
  private drawn = '';
  private images = new Map<Color, string>();

  constructor(
    private root: HTMLElement,
    private h: ControlHandlers,
  ) {
    for (const { rot, name } of ROWS) {
      const row = document.createElement('div');
      row.className = 'pad-row';
      const vertical = rot === 0 || rot === 2;
      // 縦置きは各列の真下、横置きは2列の境目の真下に来るよう、半列刻みの格子に置く
      for (let i = 0; i < (vertical ? COLS : COLS - 1); i++) {
        const col = rot === 3 ? i + 1 : i;
        const el = document.createElement('button');
        el.type = 'button';
        el.className = `pad-btn ${vertical ? 'v' : 'h'}`;
        el.style.gridColumn = `${vertical ? i * 2 + 1 : i * 2 + 2} / span 2`;
        el.setAttribute('aria-label', vertical ? `${name} ${i + 1}列目` : `${name} ${i + 1}-${i + 2}列目`);
        const axis = document.createElement('span');
        const child = document.createElement('span');
        axis.className = 'pad-gem axis';
        child.className = 'pad-gem';
        // 置いたときの見た目どおりの順に並べる（上→下、左→右）
        if (rot === 0 || rot === 3) el.append(child, axis);
        else el.append(axis, child);
        row.append(el);
        this.buttons.push({ el, col, rot, axis, child });
      }
      root.append(row);
    }

    root.addEventListener('pointerdown', (e) => this.onDown(e));
    root.addEventListener('pointermove', (e) => this.onMove(e));
    root.addEventListener('pointerup', (e) => this.onUp(e, true));
    root.addEventListener('pointercancel', (e) => this.onUp(e, false));
    root.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /** 毎フレーム呼ぶ。ペアの色と、押せるかどうかを反映する */
  update(pair: Pair | null, canControl: boolean): void {
    this.root.classList.toggle('disabled', !canControl);
    const key = pair ? `${pair.axis}-${pair.child}` : '';
    if (key === this.drawn) return;
    this.drawn = key;
    for (const b of this.buttons) {
      b.axis.style.backgroundImage = pair ? `url(${this.image(pair.axis)})` : '';
      b.child.style.backgroundImage = pair ? `url(${this.image(pair.child)})` : '';
      // 同じ色のペアは、子が下・子が左を選んでも結果が同じなので薄くする
      b.el.classList.toggle('dup', !!pair && pair.axis === pair.child && (b.rot === 2 || b.rot === 3));
    }
  }

  private image(color: Color): string {
    let url = this.images.get(color);
    if (!url) {
      url = gemSprite(color, 48).toDataURL();
      this.images.set(color, url);
    }
    return url;
  }

  private onDown(e: PointerEvent): void {
    if (!this.enabled || this.pressed || e.button === 2) return;
    const button = this.buttons.find((b) => b.el === (e.target as HTMLElement).closest('.pad-btn'));
    if (!button || !this.h.canControl()) return;
    e.preventDefault();
    this.pressed = { id: e.pointerId, button, inside: true, before: this.h.cursor() };
    button.el.classList.add('active');
    this.h.preview(button.col, button.rot, false);
  }

  private onMove(e: PointerEvent): void {
    const p = this.pressed;
    if (!p || p.id !== e.pointerId) return;
    const inside = this.isInside(p.button, e);
    if (inside === p.inside) return;
    p.inside = inside;
    p.button.el.classList.toggle('active', inside);
    // ボタンの外に出ている間は置き先の表示を消し、「離すとキャンセル」を出す
    this.h.preview(p.button.col, p.button.rot, !inside);
  }

  private onUp(e: PointerEvent, commit: boolean): void {
    const p = this.pressed;
    if (!p || p.id !== e.pointerId) return;
    this.pressed = null;
    p.button.el.classList.remove('active');
    if (commit && this.isInside(p.button, e) && this.h.canControl()) {
      this.h.preview(p.button.col, p.button.rot, false);
      this.h.pointerPlace(p.button.col, p.button.rot);
      return;
    }
    this.h.preview(p.before.col, p.before.rot, false);
    if (commit) this.h.cancelled();
  }

  private isInside(button: PadButton, e: PointerEvent): boolean {
    const r = button.el.getBoundingClientRect();
    return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
  }
}
