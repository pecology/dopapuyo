# src/input/pad.ts

タッチ操作の**ボタン方式**。置き方は全部で22パターン（縦置き 6列×2向き、横置き 5か所×2向き）あるので、1パターンにつき1つボタンを作り、盤面の下に4段に並べる。
指の位置や動かした距離で列を決める方式（片手・両手）と違い、押したボタンで置き方が決まるので、列がずれない。

ボタンは**軸ぷよが落ちる列の真下**に置く。「この列に軸を置く」と決めたら、その列の縦の並びから向きを選ぶだけになる。

```
列         1    2    3    4    5    6
縦・子が上 [上] [上] [上] [上] [上] [上]
縦・子が下 [下] [下] [下] [下] [下] [下]
横・子が右 [右] [右] [右] [右] [右]  ・
横・子が左  ・  [左] [左] [左] [左] [左]
```

横・子が右の6列目と、横・子が左の1列目は、子ぷよが盤面の外に出てしまうので置けない（空き）。

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
  8 | const ROWS: { rot: Rotation; name: string; dir: string }[] = [
  9 |   { rot: 0, name: '縦・子が上', dir: 'up' },
 10 |   { rot: 2, name: '縦・子が下', dir: 'down' },
 11 |   { rot: 1, name: '横・子が右', dir: 'right' },
 12 |   { rot: 3, name: '横・子が左', dir: 'left' },
 13 | ];
 14 | 
```

4段の並びを上から順に書いた表。`rot` は子ぷよの向き（0=上、1=右、2=下、3=左）、`name` は読み上げソフト用の名前、`dir` はボタンに付ける CSS のクラス名（子ぷよをどちらにずらして描くかを決める）。

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

**L24–39**

```ts
 24 | /**
 25 |  * ボタン方式（タッチ）: 置き方22パターンを1つずつボタンにして、盤面の下に並べる。
 26 |  * ボタンは軸ぷよが落ちる列の真下に置く（横・子が右の6列目と、横・子が左の1列目は置けないので空き）。
 27 |  * - ボタンに指を置くと盤面に置き先を表示し、離すと設置
 28 |  * - 指を置いたままボタンの外へずらして離すと、置かずに取り消す
 29 |  * - 各ボタンには今のペアの色で、軸ぷよを中央に、子ぷよを小さくその向きにずらして描く
 30 |  */
 31 | export class ButtonPad {
 32 |   enabled = false;
 33 |   private buttons: PadButton[] = [];
 34 |   private pressed: { id: number; button: PadButton; inside: boolean; before: { col: number; rot: Rotation } } | null =
 35 |     null;
 36 |   /** 今描いているペア（変わったときだけ描き直す） */
 37 |   private drawn = '';
 38 |   private images = new Map<Color, string>();
 39 | 
```

- `enabled` … ボタン方式を選んでいるときだけ true。
- `buttons` … 22個のボタン。
- `pressed` … 今押しているボタン。どの指か（`id`）、どのボタンか、指がまだボタンの上にあるか（`inside`）、押す前のカーソルの列と向き（`before`、取り消したときに戻す）。
- `drawn` … 今ボタンに描いているペア。ペアが変わったときだけ描き直すために覚えておく。
- `images` … 色ごとの宝石の絵（画像のデータ）。一度作ったら使い回す。

## ボタンを作る

**L40–65**

```ts
 40 |   constructor(
 41 |     private root: HTMLElement,
 42 |     private h: ControlHandlers,
 43 |   ) {
 44 |     for (const { rot, name, dir } of ROWS) {
 45 |       const row = document.createElement('div');
 46 |       row.className = 'pad-row';
 47 |       for (let col = 0; col < COLS; col++) {
 48 |         // 子ぷよが盤面の外に出る置き方はない
 49 |         if ((rot === 1 && col === COLS - 1) || (rot === 3 && col === 0)) continue;
 50 |         const el = document.createElement('button');
 51 |         el.type = 'button';
 52 |         el.className = `pad-btn ${dir}`;
 53 |         el.style.gridColumn = String(col + 1);
 54 |         el.setAttribute('aria-label', `${name} 軸${col + 1}列目`);
 55 |         const axis = document.createElement('span');
 56 |         const child = document.createElement('span');
 57 |         axis.className = 'pad-gem axis';
 58 |         child.className = 'pad-gem child';
 59 |         el.append(axis, child);
 60 |         row.append(el);
 61 |         this.buttons.push({ el, col, rot, axis, child });
 62 |       }
 63 |       root.append(row);
 64 |     }
 65 | 
```

- L44: 4段を上から順に作る。
- L47–49: 1列目から6列目まで、軸ぷよの列ごとにボタンを作る。子ぷよが盤面の外に出る置き方（子が右で6列目、子が左で1列目）は飛ばす（`continue`）。
- L52: `dir`（up / down / right / left）をクラスに付ける。CSS がこれを見て、子ぷよの絵をどちらにずらすかを決める。
- L53: `gridColumn` … 6列の格子の何列目に置くか。軸ぷよの列と同じ。飛ばした置き方のところは空きになる。
- L54: 読み上げソフト用の名前（例: 「横・子が右 軸5列目」）。
- L55–59: 中にぷよの絵を2個入れる。軸ぷよには `axis`、子ぷよには `child` クラスを付ける。位置と大きさは CSS が決める（軸ぷよはボタンの中央、子ぷよは小さくして向きの方へずらす）。

**L66–72**

```ts
 66 |     root.addEventListener('pointerdown', (e) => this.onDown(e));
 67 |     root.addEventListener('pointermove', (e) => this.onMove(e));
 68 |     root.addEventListener('pointerup', (e) => this.onUp(e, true));
 69 |     root.addEventListener('pointercancel', (e) => this.onUp(e, false));
 70 |     root.addEventListener('contextmenu', (e) => e.preventDefault());
 71 |   }
 72 | 
```

指を置く・動かす・離す・（OS などに）取り上げられる、のイベントを、ボタン1個ずつではなく、まとめて箱（`root`）に登録する。どのボタンかは、イベントが起きた要素から調べる。
`contextmenu` … 長押しでメニューが出ないようにする。

## 色と押せるかどうかの反映 update

**L73–86**

```ts
 73 |   /** 毎フレーム呼ぶ。ペアの色と、押せるかどうかを反映する */
 74 |   update(pair: Pair | null, canControl: boolean): void {
 75 |     this.root.classList.toggle('disabled', !canControl);
 76 |     const key = pair ? `${pair.axis}-${pair.child}` : '';
 77 |     if (key === this.drawn) return;
 78 |     this.drawn = key;
 79 |     for (const b of this.buttons) {
 80 |       b.axis.style.backgroundImage = pair ? `url(${this.image(pair.axis)})` : '';
 81 |       b.child.style.backgroundImage = pair ? `url(${this.image(pair.child)})` : '';
 82 |       // 同じ色のペアは、子が下・子が左を選んでも結果が同じなので薄くする
 83 |       b.el.classList.toggle('dup', !!pair && pair.axis === pair.child && (b.rot === 2 || b.rot === 3));
 84 |     }
 85 |   }
 86 | 
```

`main.ts` が毎フレーム呼ぶ。
- L75: 連鎖の演出中など、まだ置けないときは箱に `disabled` クラスを付けて、ボタンを薄く見せる。
- L76–78: ペアが前と同じなら何もしない（毎フレーム画像を入れ直すと無駄なので）。
- L80–81: 全部のボタンに、今のペアの軸ぷよと子ぷよの色の絵を入れる。
- L83: 同じ色のペア（例: 赤赤）では、子が下・子が左を選んでも、子が上・子が右と結果が同じなので、そのボタンを薄くする（押すことはできる）。

**L87–95**

```ts
 87 |   private image(color: Color): string {
 88 |     let url = this.images.get(color);
 89 |     if (!url) {
 90 |       url = gemSprite(color, 48).toDataURL();
 91 |       this.images.set(color, url);
 92 |     }
 93 |     return url;
 94 |   }
 95 | 
```

色ごとの宝石の絵を作る。盤面と同じ `gemSprite`（`render/gems.ts`）で描いた canvas を、`toDataURL()` で画像のデータ（`data:image/png;base64,...` という文字列）にして、CSS の背景画像として使う。作ったものは `images` に覚えておく。

## 押したとき onDown

**L96–105**

```ts
 96 |   private onDown(e: PointerEvent): void {
 97 |     if (!this.enabled || this.pressed || e.button === 2) return;
 98 |     const button = this.buttons.find((b) => b.el === (e.target as HTMLElement).closest('.pad-btn'));
 99 |     if (!button || !this.h.canControl()) return;
100 |     e.preventDefault();
101 |     this.pressed = { id: e.pointerId, button, inside: true, before: this.h.cursor() };
102 |     button.el.classList.add('active');
103 |     this.h.preview(button.col, button.rot, false);
104 |   }
105 | 
```

- L97: ボタン方式でないとき、別の指でもう押しているとき、右クリックのときは何もしない。
- L98: 触った要素から一番近いボタン（`closest('.pad-btn')`）を探す。ぷよの絵の上を触っても、そのボタンになる。
- L99: ボタン以外の場所、または連鎖の演出中などで置けないときは何もしない。
- L101: 押しているボタンを覚える。取り消したときに戻せるよう、今のカーソルの位置も覚える。
- L102–103: ボタンを金色にして、盤面に置き先を表示する。

## 指を動かしたとき onMove

**L106–116**

```ts
106 |   private onMove(e: PointerEvent): void {
107 |     const p = this.pressed;
108 |     if (!p || p.id !== e.pointerId) return;
109 |     const inside = this.isInside(p.button, e);
110 |     if (inside === p.inside) return;
111 |     p.inside = inside;
112 |     p.button.el.classList.toggle('active', inside);
113 |     // ボタンの外に出ている間は置き先の表示を消し、「離すとキャンセル」を出す
114 |     this.h.preview(p.button.col, p.button.rot, !inside);
115 |   }
116 | 
```

指がボタンの外に出たか、また戻ってきたかを調べる。
外に出たらボタンの色を戻し、盤面に「離すとキャンセル」を表示する（`preview` の3つ目の引数を true にする）。戻ってきたら、また置き先を表示する。

## 離したとき onUp

**L117–130**

```ts
117 |   private onUp(e: PointerEvent, commit: boolean): void {
118 |     const p = this.pressed;
119 |     if (!p || p.id !== e.pointerId) return;
120 |     this.pressed = null;
121 |     p.button.el.classList.remove('active');
122 |     if (commit && this.isInside(p.button, e) && this.h.canControl()) {
123 |       this.h.preview(p.button.col, p.button.rot, false);
124 |       this.h.pointerPlace(p.button.col, p.button.rot);
125 |       return;
126 |     }
127 |     this.h.preview(p.before.col, p.before.rot, false);
128 |     if (commit) this.h.cancelled();
129 |   }
130 | 
```

- L122–125: 指がボタンの上で離れ、置ける状態なら、そのボタンの置き方で置く。
- L127–128: ボタンの外で離したとき（または `pointercancel`）は置かない。カーソルを押す前に戻し、指で離したときだけキャンセル音を鳴らす。

**L131–135**

```ts
131 |   private isInside(button: PadButton, e: PointerEvent): boolean {
132 |     const r = button.el.getBoundingClientRect();
133 |     return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
134 |   }
135 | }
```

`isInside` … 指の位置がボタンの四角の中にあるか。`getBoundingClientRect()` は要素の画面上の位置と大きさ。
