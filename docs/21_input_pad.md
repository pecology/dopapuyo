# src/input/pad.ts

タッチ操作の**ボタン方式**。置き方は全部で22パターン（縦置き 6列×2向き、横置き 5か所×2向き）あるので、1パターンにつき1つボタンを作り、盤面の下に4段に並べる。
指の位置や動かした距離で列を決める方式（片手・両手）と違い、押したボタンで置き方が決まるので、列がずれない。

```
縦（子が上）  [1][2][3][4][5][6]
縦（子が下）  [1][2][3][4][5][6]
横（子が右）    [1-2][2-3][3-4][4-5][5-6]
横（子が左）    [1-2][2-3][3-4][4-5][5-6]
```

**L1–6**

```ts
  1 | import { COLS } from '../config';
  2 | import type { Rotation } from '../core/field';
  3 | import type { Color, Pair } from '../core/tsumo';
  4 | import { gemSprite } from '../render/gems';
  5 | import type { ControlHandlers } from './controls';
  6 | 
```

列の数、向きの型、ペアと色の型、宝石の絵を作る関数、`main.ts` にお願いする操作の一覧（`ControlHandlers`、`controls.ts` 参照）を読み込む。

**L7–14**

```ts
  7 | /** 段の並び（上から）: 縦（子が上）・縦（子が下）・横（子が右）・横（子が左） */
  8 | const ROWS: { rot: Rotation; name: string }[] = [
  9 |   { rot: 0, name: '縦・子が上' },
 10 |   { rot: 2, name: '縦・子が下' },
 11 |   { rot: 1, name: '横・子が右' },
 12 |   { rot: 3, name: '横・子が左' },
 13 | ];
 14 | 
```

4段の並びを上から順に書いた表。`rot` は子ぷよの向き（0=上、1=右、2=下、3=左）、`name` は読み上げソフト用の名前に使う。

**L15–23**

```ts
 15 | interface PadButton {
 16 |   el: HTMLButtonElement;
 17 |   /** 軸ぷよの列 */
 18 |   col: number;
 19 |   rot: Rotation;
 20 |   axis: HTMLSpanElement;
 21 |   child: HTMLSpanElement;
 22 | }
 23 | 
```

ボタン1個ぶんの情報。ボタン本体（`el`）、置いたときの軸ぷよの列（`col`）と向き（`rot`）、中に描く軸ぷよと子ぷよの絵（`axis` / `child`）。

**L24–38**

```ts
 24 | /**
 25 |  * ボタン方式（タッチ）: 置き方22パターンを1つずつボタンにして、盤面の下に並べる。
 26 |  * - ボタンに指を置くと盤面に置き先を表示し、離すと設置
 27 |  * - 指を置いたままボタンの外へずらして離すと、置かずに取り消す
 28 |  * - 各ボタンには今のペアの色で、置いたときの形を描く
 29 |  */
 30 | export class ButtonPad {
 31 |   enabled = false;
 32 |   private buttons: PadButton[] = [];
 33 |   private pressed: { id: number; button: PadButton; inside: boolean; before: { col: number; rot: Rotation } } | null =
 34 |     null;
 35 |   /** 今描いているペア（変わったときだけ描き直す） */
 36 |   private drawn = '';
 37 |   private images = new Map<Color, string>();
 38 | 
```

- `enabled` … ボタン方式を選んでいるときだけ true。
- `buttons` … 22個のボタン。
- `pressed` … 今押しているボタン。どの指か（`id`）、どのボタンか、指がまだボタンの上にあるか（`inside`）、押す前のカーソルの列と向き（`before`、取り消したときに戻す）。
- `drawn` … 今ボタンに描いているペア。ペアが変わったときだけ描き直すために覚えておく。
- `images` … 色ごとの宝石の絵（画像のデータ）。一度作ったら使い回す。

## ボタンを作る

**L39–67**

```ts
 39 |   constructor(
 40 |     private root: HTMLElement,
 41 |     private h: ControlHandlers,
 42 |   ) {
 43 |     for (const { rot, name } of ROWS) {
 44 |       const row = document.createElement('div');
 45 |       row.className = 'pad-row';
 46 |       const vertical = rot === 0 || rot === 2;
 47 |       // 縦置きは各列の真下、横置きは2列の境目の真下に来るよう、半列刻みの格子に置く
 48 |       for (let i = 0; i < (vertical ? COLS : COLS - 1); i++) {
 49 |         const col = rot === 3 ? i + 1 : i;
 50 |         const el = document.createElement('button');
 51 |         el.type = 'button';
 52 |         el.className = `pad-btn ${vertical ? 'v' : 'h'}`;
 53 |         el.style.gridColumn = `${vertical ? i * 2 + 1 : i * 2 + 2} / span 2`;
 54 |         el.setAttribute('aria-label', vertical ? `${name} ${i + 1}列目` : `${name} ${i + 1}-${i + 2}列目`);
 55 |         const axis = document.createElement('span');
 56 |         const child = document.createElement('span');
 57 |         axis.className = 'pad-gem axis';
 58 |         child.className = 'pad-gem';
 59 |         // 置いたときの見た目どおりの順に並べる（上→下、左→右）
 60 |         if (rot === 0 || rot === 3) el.append(child, axis);
 61 |         else el.append(axis, child);
 62 |         row.append(el);
 63 |         this.buttons.push({ el, col, rot, axis, child });
 64 |       }
 65 |       root.append(row);
 66 |     }
 67 | 
```

- L43: 4段を上から順に作る。
- L46: 子が上・子が下なら縦置き。
- L48: 縦置きは6個、横置きは5個。
- L49: 軸ぷよの列。横置きで子が左のときは、境目の右側の列が軸になる（たとえば「1-2列目・子が左」は、軸が2列目、子が1列目）。
- L53: `gridColumn` … 12マス（半列ずつ）の格子のどこに置くか。縦置きは `i * 2 + 1` から2マス（列の真下）、横置きは `i * 2 + 2` から2マス（2列の境目の真下）。`/ span 2` は「2マスぶん」。
- L54: 読み上げソフト用の名前（例: 「横・子が右 5-6列目」）。
- L55–61: 中にぷよの絵を2個入れる。置いたときの見た目どおりになるよう、子が上・子が左のときは子ぷよを先（上・左）に、それ以外は軸ぷよを先に並べる。軸ぷよには `axis` クラスを付けて目印の輪を出す。

**L68–74**

```ts
 68 |     root.addEventListener('pointerdown', (e) => this.onDown(e));
 69 |     root.addEventListener('pointermove', (e) => this.onMove(e));
 70 |     root.addEventListener('pointerup', (e) => this.onUp(e, true));
 71 |     root.addEventListener('pointercancel', (e) => this.onUp(e, false));
 72 |     root.addEventListener('contextmenu', (e) => e.preventDefault());
 73 |   }
 74 | 
```

指を置く・動かす・離す・（OS などに）取り上げられる、のイベントを、ボタン1個ずつではなく、まとめて箱（`root`）に登録する。どのボタンかは、イベントが起きた要素から調べる。
`contextmenu` … 長押しでメニューが出ないようにする。

## 色と押せるかどうかの反映 update

**L75–88**

```ts
 75 |   /** 毎フレーム呼ぶ。ペアの色と、押せるかどうかを反映する */
 76 |   update(pair: Pair | null, canControl: boolean): void {
 77 |     this.root.classList.toggle('disabled', !canControl);
 78 |     const key = pair ? `${pair.axis}-${pair.child}` : '';
 79 |     if (key === this.drawn) return;
 80 |     this.drawn = key;
 81 |     for (const b of this.buttons) {
 82 |       b.axis.style.backgroundImage = pair ? `url(${this.image(pair.axis)})` : '';
 83 |       b.child.style.backgroundImage = pair ? `url(${this.image(pair.child)})` : '';
 84 |       // 同じ色のペアは、子が下・子が左を選んでも結果が同じなので薄くする
 85 |       b.el.classList.toggle('dup', !!pair && pair.axis === pair.child && (b.rot === 2 || b.rot === 3));
 86 |     }
 87 |   }
 88 | 
```

`main.ts` が毎フレーム呼ぶ。
- L77: 連鎖の演出中など、まだ置けないときは箱に `disabled` クラスを付けて、ボタンを薄く見せる。
- L78–80: ペアが前と同じなら何もしない（毎フレーム画像を入れ直すと無駄なので）。
- L82–83: 全部のボタンに、今のペアの軸ぷよと子ぷよの色の絵を入れる。
- L85: 同じ色のペア（例: 赤赤）では、子が下・子が左を選んでも、子が上・子が右と結果が同じなので、そのボタンを薄くする（押すことはできる）。

**L89–97**

```ts
 89 |   private image(color: Color): string {
 90 |     let url = this.images.get(color);
 91 |     if (!url) {
 92 |       url = gemSprite(color, 48).toDataURL();
 93 |       this.images.set(color, url);
 94 |     }
 95 |     return url;
 96 |   }
 97 | 
```

色ごとの宝石の絵を作る。盤面と同じ `gemSprite`（`render/gems.ts`）で描いた canvas を、`toDataURL()` で画像のデータ（`data:image/png;base64,...` という文字列）にして、CSS の背景画像として使う。作ったものは `images` に覚えておく。

## 押したとき onDown

**L98–107**

```ts
 98 |   private onDown(e: PointerEvent): void {
 99 |     if (!this.enabled || this.pressed || e.button === 2) return;
100 |     const button = this.buttons.find((b) => b.el === (e.target as HTMLElement).closest('.pad-btn'));
101 |     if (!button || !this.h.canControl()) return;
102 |     e.preventDefault();
103 |     this.pressed = { id: e.pointerId, button, inside: true, before: this.h.cursor() };
104 |     button.el.classList.add('active');
105 |     this.h.preview(button.col, button.rot, false);
106 |   }
107 | 
```

- L99: ボタン方式でないとき、別の指でもう押しているとき、右クリックのときは何もしない。
- L100: 触った要素から一番近いボタン（`closest('.pad-btn')`）を探す。ぷよの絵の上を触っても、そのボタンになる。
- L101: ボタン以外の場所、または連鎖の演出中などで置けないときは何もしない。
- L103: 押しているボタンを覚える。取り消したときに戻せるよう、今のカーソルの位置も覚える。
- L104–105: ボタンを金色にして、盤面に置き先を表示する。

## 指を動かしたとき onMove

**L108–118**

```ts
108 |   private onMove(e: PointerEvent): void {
109 |     const p = this.pressed;
110 |     if (!p || p.id !== e.pointerId) return;
111 |     const inside = this.isInside(p.button, e);
112 |     if (inside === p.inside) return;
113 |     p.inside = inside;
114 |     p.button.el.classList.toggle('active', inside);
115 |     // ボタンの外に出ている間は置き先の表示を消し、「離すとキャンセル」を出す
116 |     this.h.preview(p.button.col, p.button.rot, !inside);
117 |   }
118 | 
```

指がボタンの外に出たか、また戻ってきたかを調べる。
外に出たらボタンの色を戻し、盤面に「離すとキャンセル」を表示する（`preview` の3つ目の引数を true にする）。戻ってきたら、また置き先を表示する。

## 離したとき onUp

**L119–132**

```ts
119 |   private onUp(e: PointerEvent, commit: boolean): void {
120 |     const p = this.pressed;
121 |     if (!p || p.id !== e.pointerId) return;
122 |     this.pressed = null;
123 |     p.button.el.classList.remove('active');
124 |     if (commit && this.isInside(p.button, e) && this.h.canControl()) {
125 |       this.h.preview(p.button.col, p.button.rot, false);
126 |       this.h.pointerPlace(p.button.col, p.button.rot);
127 |       return;
128 |     }
129 |     this.h.preview(p.before.col, p.before.rot, false);
130 |     if (commit) this.h.cancelled();
131 |   }
132 | 
```

- L124–127: 指がボタンの上で離れ、置ける状態なら、そのボタンの置き方で置く。
- L129–130: ボタンの外で離したとき（または `pointercancel`）は置かない。カーソルを押す前に戻し、指で離したときだけキャンセル音を鳴らす。

**L133–137**

```ts
133 |   private isInside(button: PadButton, e: PointerEvent): boolean {
134 |     const r = button.el.getBoundingClientRect();
135 |     return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
136 |   }
137 | }
```

`isInside` … 指の位置がボタンの四角の中にあるか。`getBoundingClientRect()` は要素の画面上の位置と大きさ。
