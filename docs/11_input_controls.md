# src/input/controls.ts

キーボードとタッチ／マウスの入力を受け取るファイル。

入力クラスは「何が押されたか」を判断するだけで、ゲームを直接動かさない。代わりに `ControlHandlers`（やってほしいことの一覧）を `main.ts` から受け取り、「左に動かして」「ここに置いて」と頼む。
こうしておくと、入力の仕組みとゲームの処理が混ざらず、それぞれ読みやすくなる。

**L1–4**

```ts
  1 | import { COLS, CONFIG } from '../config';
  2 | import type { Rotation } from '../core/field';
  3 | import type { ControlScheme } from '../storage';
  4 | 
```

寸法と設定、向きの型、操作方式の型を読み込む。

## main.ts にお願いする操作の一覧 ControlHandlers

**L5–28**

```ts
  5 | export interface ControlHandlers {
  6 |   /** ゲーム操作を受け付けられる状態か */
  7 |   canControl(): boolean;
  8 |   move(dx: number): boolean;
  9 |   moveToWall(dx: number): void;
 10 |   rotate(dir: 1 | -1): void;
 11 |   setRotation(rot: Rotation): void;
 12 |   /** 現在のカーソル位置に置く */
 13 |   place(): void;
 14 |   /** 列を指定して置く（向きは現在のもの） */
 15 |   placeAt(col: number): void;
 16 |   /** タッチ/マウスのプレビュー（列と向き）。outside は「離すとキャンセル」の位置にいるか */
 17 |   preview(col: number, rot: Rotation, outside: boolean): void;
 18 |   /** タッチ/マウスの操作が取り消された */
 19 |   cancelled(): void;
 20 |   pointerPlace(col: number, rot: Rotation): void;
 21 |   /** 1手戻す（ペナルティ付き） */
 22 |   undo(): void;
 23 |   retry(): void;
 24 |   newSeed(): void;
 25 |   menu(): void;
 26 |   start(): void;
 27 | }
 28 | 
```

`interface` に関数の形を並べたもの。`main.ts` がこの形どおりの関数を用意して渡す。
- `canControl()` … 今ゲーム操作を受け付けてよいか（連鎖演出中やメニュー中は false）。
- `move(dx)` … 左右に1列動かす。動けたら true（壁なら false）。
- `moveToWall(dx)` … 壁まで一気に動かす。
- `rotate(dir)` … 回転。`1 | -1` は「1か-1のどちらか」。
- `setRotation(rot)` … 向きを直接指定（直接指定方式の WASD）。
- `place()` / `placeAt(col)` … 今の位置に置く／列を指定して置く。
- `preview(col, rot, outside)` … タッチ中の置き先を表示する。`outside` は「離すとキャンセル」の位置にいるか。
- `cancelled()` … タッチ操作が取り消された。
- `pointerPlace(col, rot)` … タッチで置く。
- `undo()` / `retry()` / `newSeed()` / `menu()` / `start()` … 1手戻す、リトライ、新しいシード、メニューへ、スタート。

**L29–31**

```ts
 29 | const DIRECT_COLUMNS = ['KeyH', 'KeyJ', 'KeyK', 'KeyL', 'Semicolon', 'Quote'];
 30 | const DIRECT_ROT: Record<string, Rotation> = { KeyW: 0, KeyD: 1, KeyS: 2, KeyA: 3 };
 31 | 
```

直接指定方式のキー割り当て。
- `DIRECT_COLUMNS` … 列1〜6に対応するキー。配列の何番目かがそのまま列番号になる。
- `DIRECT_ROT` … W=上、D=右、S=下、A=左。

ここで使っている `'KeyH'` などは `KeyboardEvent.code` の値で、**キーボード上の物理的な位置**を表す。日本語配列でも英語配列でも同じ位置のキーなら同じ値になるので、配列の違いを気にしなくてよい（`'Quote'` は英語配列の `'` の位置で、日本語配列では `:` のキー）。

## キーボード入力 Keyboard

**L32–36**

```ts
 32 | /** キーボード入力。矢印キー方式は独自の DAS/ARR で長押し移動する */
 33 | export class Keyboard {
 34 |   scheme: ControlScheme = 'arrow';
 35 |   private held: { dir: -1 | 1; since: number; last: number; charged: boolean } | null = null;
 36 | 
```

- `scheme` … 今の操作方式。オプションを変えると `main.ts` が書き換える。
- `held` … 左右キーを押しっぱなしにしている状態。押している方向、押し始めた時刻、最後に動いた時刻、連続移動が始まったか。押していなければ `null`。

**L37–42**

```ts
 37 |   constructor(private h: ControlHandlers) {
 38 |     window.addEventListener('keydown', (e) => this.onDown(e));
 39 |     window.addEventListener('keyup', (e) => this.onUp(e));
 40 |     window.addEventListener('blur', () => (this.held = null));
 41 |   }
 42 | 
```

コンストラクタで、ページ全体（`window`）のキー入力を監視する。
- `addEventListener('keydown', 関数)` … キーが押されたら関数を呼ぶ。
- `blur` … ウィンドウからフォーカスが外れた（別のアプリに切り替えた）とき。キーを離したことが伝わらない場合があるので、押しっぱなし状態を解除しておく。
- `(e) => this.onDown(e)` のように矢印関数で包んでいるのは、`onDown` の中の `this` がこのクラスを指すようにするため。

## キーが押されたとき onDown

**L43–48**

```ts
 43 |   private onDown(e: KeyboardEvent): void {
 44 |     const target = e.target as HTMLElement | null;
 45 |     if (target && (target.tagName === 'INPUT' || target.tagName === 'SELECT')) return;
 46 |     // フォーカス中のボタンは Enter / Space でそのボタン自身を押す
 47 |     if (target?.tagName === 'BUTTON' && (e.code === 'Enter' || e.code === 'Space')) return;
 48 | 
```

- L44–45: 文字入力欄（シード番号の入力など）で打っているときは、ゲーム操作として扱わない。
- L47: ボタンにフォーカスがあるときの Enter / Space は、ブラウザの標準動作（そのボタンを押す）に任せる。ここで横取りすると、メニューで「ランキング」ボタンを選んで Enter を押したのにゲームが始まってしまう。

**L49–73**

```ts
 49 |     switch (e.code) {
 50 |       case 'KeyQ':
 51 |       case 'Backspace':
 52 |         e.preventDefault();
 53 |         if (!e.repeat) this.h.undo();
 54 |         return;
 55 |       case 'KeyR':
 56 |         e.preventDefault();
 57 |         if (!e.repeat) this.h.retry();
 58 |         return;
 59 |       case 'KeyN':
 60 |         e.preventDefault();
 61 |         if (!e.repeat) this.h.newSeed();
 62 |         return;
 63 |       case 'Escape':
 64 |         e.preventDefault();
 65 |         this.h.menu();
 66 |         return;
 67 |       case 'Enter':
 68 |       case 'Space':
 69 |         if (!e.repeat) this.h.start();
 70 |         e.preventDefault();
 71 |         return;
 72 |     }
 73 | 
```

どの操作方式でも共通のキー。`switch (e.code)` で押されたキーごとに分ける。`case` を2つ並べると「どちらでも同じ処理」。
- `e.preventDefault()` … ブラウザの標準動作を止める。たとえば Backspace で前のページに戻る、Space でページがスクロールする、といった動作を防ぐ。
- `e.repeat` … キーを押しっぱなしにしたときに OS が自動で繰り返し送ってくる入力なら true。リトライや1手戻すが連打されないよう、繰り返しは無視する。

**L74–78**

```ts
 74 |     if (e.repeat) {
 75 |       if (e.code.startsWith('Arrow')) e.preventDefault();
 76 |       return;
 77 |     }
 78 | 
```

ここから先は押しっぱなしの繰り返し入力を無視する（左右の連続移動は、OS の繰り返しではなく自前の DAS/ARR で行うため）。
矢印キーの繰り返しも `preventDefault` しておかないと、ページがスクロールしてしまうことがある。

**L79–101**

```ts
 79 |     if (this.scheme === 'arrow') {
 80 |       switch (e.code) {
 81 |         case 'ArrowLeft':
 82 |         case 'ArrowRight': {
 83 |           e.preventDefault();
 84 |           const dir = e.code === 'ArrowLeft' ? -1 : 1;
 85 |           const now = performance.now();
 86 |           this.held = { dir, since: now, last: now, charged: false };
 87 |           if (this.h.canControl()) this.h.move(dir);
 88 |           return;
 89 |         }
 90 |         case 'KeyZ':
 91 |           if (this.h.canControl()) this.h.rotate(-1);
 92 |           return;
 93 |         case 'KeyX':
 94 |           if (this.h.canControl()) this.h.rotate(1);
 95 |           return;
 96 |         case 'ArrowDown':
 97 |         case 'ArrowUp':
 98 |           e.preventDefault();
 99 |           if (this.h.canControl()) this.h.place();
100 |           return;
101 |       }
```

矢印キー方式。
- L81–89: ←→。押した瞬間に1列動かし、押しっぱなし状態を記録する。続きの連続移動は `update()` で行う。`case` の中を `{ ... }` で囲んでいるのは、その中で `const` を宣言するため。
- L90–95: Z で左回転（-1）、X で右回転（+1）。
- L96–100: ↓ か ↑ で置く。

**L102–114**

```ts
102 |     } else {
103 |       if (e.code in DIRECT_ROT) {
104 |         if (this.h.canControl()) this.h.setRotation(DIRECT_ROT[e.code]);
105 |         return;
106 |       }
107 |       const col = DIRECT_COLUMNS.indexOf(e.code);
108 |       if (col >= 0) {
109 |         e.preventDefault();
110 |         if (this.h.canControl()) this.h.placeAt(col);
111 |       }
112 |     }
113 |   }
114 | 
```

直接指定方式。
- L103: `e.code in DIRECT_ROT` … 押したキーが W/A/S/D のどれかなら（`in` は「オブジェクトにそのキーがあるか」）、向きを変える。
- L107–111: `indexOf` で列キーの何番目かを調べ、見つかれば（-1 でなければ）その列に置く。

## キーが離されたとき onUp

**L115–121**

```ts
115 |   private onUp(e: KeyboardEvent): void {
116 |     if (!this.held) return;
117 |     if ((e.code === 'ArrowLeft' && this.held.dir === -1) || (e.code === 'ArrowRight' && this.held.dir === 1)) {
118 |       this.held = null;
119 |     }
120 |   }
121 | 
```

押しっぱなしにしていた方向のキーが離されたら、押しっぱなし状態を解除する。←を押したまま→を押して←を離した、のような場合に、関係ないキーで解除しないよう方向を確かめている。

## 長押しの連続移動 update

**L122–130**

```ts
122 |   /** 毎フレーム呼ぶ（長押しの連続移動） */
123 |   update(now: number): void {
124 |     const held = this.held;
125 |     if (!held || this.scheme !== 'arrow' || !this.h.canControl()) return;
126 |     if (!held.charged) {
127 |       if (now - held.since < CONFIG.DAS_MS) return;
128 |       held.charged = true;
129 |       held.last = now - CONFIG.ARR_MS;
130 |     }
```

`main.ts` から毎フレーム呼ばれる。
- L125: 押していない、矢印キー方式でない、操作できない状態なら何もしない。
- L126–130: まだ連続移動が始まっていないとき。押してから `DAS_MS`（110ms）経つまでは待つ。経ったら連続移動を開始し、すぐ1回動くように「最後に動いた時刻」を1間隔ぶん前にしておく。

**L131–145**

```ts
131 |     if (CONFIG.ARR_MS <= 0) {
132 |       this.h.moveToWall(held.dir);
133 |       return;
134 |     }
135 |     let guard = COLS;
136 |     while (now - held.last >= CONFIG.ARR_MS && guard-- > 0) {
137 |       held.last += CONFIG.ARR_MS;
138 |       if (!this.h.move(held.dir)) {
139 |         held.last = now;
140 |         break;
141 |       }
142 |     }
143 |   }
144 | }
145 | 
```

- L131–134: 間隔が0の設定なら、壁まで一気に動かす。
- L135–142: 前回動いてから `ARR_MS`（25ms）経つごとに1列動かす。フレームの間隔が空いて2回ぶん以上経っていれば、その回数ぶん動かす（`while`）。
  - `guard` … 万一の無限ループ防止。最大6回で止める。`guard-- > 0` は「比べてから1減らす」。
  - L138–141: 壁にぶつかって動けなければ、ループを抜ける。

## タッチ／マウス入力 Pointer

**L146–156**

```ts
146 | /**
147 |  * タッチ／マウス: タップした列＝軸ぷよの列、フリック方向＝子ぷよの向き。
148 |  * 指を置いている間はプレビュー、離した時点で設置。
149 |  * 取り消し: 盤面の外まで引っぱって離す／2本目の指でタップ／右クリック。
150 |  */
151 | export class Pointer {
152 |   threshold = 24;
153 |   private active: { id: number; x0: number; y0: number; col: number; rot: Rotation; outside: boolean } | null = null;
154 |   /** キャンセルに使った指（離したときに何もしないよう覚えておく） */
155 |   private ignored = new Set<number>();
156 | 
```

**Pointer Events** という仕組みを使う。マウス・タッチ・ペンをまとめて同じイベント（`pointerdown`、`pointermove`、`pointerup`）で扱える。指が複数あるときは `pointerId` で区別する。
- `threshold` … これ以上動かしたらフリックとみなす距離（px）。オプションで変えられる。
- `active` … 今操作中の指。どの指か、置いた位置、選んだ列と向き、盤面外にいるか。
- `ignored` … キャンセルに使った指。その指を離したときに「置く」処理が走らないよう覚えておく。

**L157–166**

```ts
157 |   constructor(
158 |     canvas: HTMLCanvasElement,
159 |     private columnAt: (cx: number, cy: number) => number | null,
160 |     private isOutside: (cx: number, cy: number) => boolean,
161 |     private h: ControlHandlers,
162 |   ) {
163 |     canvas.addEventListener('contextmenu', (e) => {
164 |       e.preventDefault();
165 |       this.cancel();
166 |     });
```

- コンストラクタの引数で、列を求める関数・盤面外かを判定する関数（どちらも renderer のもの）と、操作の一覧を受け取る。
- L163–166: 右クリックでブラウザのメニューが出ないようにし（`preventDefault`）、操作中ならキャンセルする。

## 指を置いたとき pointerdown

**L167–183**

```ts
167 |     canvas.addEventListener('pointerdown', (e) => {
168 |       // 操作中にもう1本の指・右クリックが来たらキャンセル
169 |       if (this.active) {
170 |         e.preventDefault();
171 |         this.ignored.add(e.pointerId);
172 |         this.cancel();
173 |         return;
174 |       }
175 |       if (e.button === 2) return;
176 |       if (!this.h.canControl()) return;
177 |       const col = this.columnAt(e.clientX, e.clientY);
178 |       if (col === null) return;
179 |       e.preventDefault();
180 |       canvas.setPointerCapture(e.pointerId);
181 |       this.active = { id: e.pointerId, x0: e.clientX, y0: e.clientY, col, rot: 0, outside: false };
182 |       this.h.preview(col, 0, false);
183 |     });
```

- L169–174: すでに別の指で操作中なのに新しい指（またはマウスの別ボタン）が来たら、それは「2本目の指でタップ」なのでキャンセルする。その2本目の指も、離したときに何もしないよう `ignored` に入れる。
- L175: 右ボタンだけで押した場合は何もしない。`button` は 0=左、2=右。
- L176: 連鎖演出中などは受け付けない。
- L177–178: 触った位置の列を求める。盤面から外れていれば無視。
- L180: `setPointerCapture` … 指が canvas の外に出ても、離すまでこの canvas にイベントが届き続けるようにする。盤面外まで引っぱってキャンセル、をするのに必要。
- L181–182: 操作中の指として記録し、「子が上」の向きでプレビューを出す。

## 指を動かしたとき pointermove

**L184–195**

```ts
184 |     canvas.addEventListener('pointermove', (e) => {
185 |       const a = this.active;
186 |       if (!a || a.id !== e.pointerId) return;
187 |       // 左ボタンを押したまま右ボタンを押した（同じマウスなので pointerdown ではなく move で届く）
188 |       if (e.pointerType === 'mouse' && e.buttons & 2) {
189 |         this.cancel();
190 |         return;
191 |       }
192 |       a.outside = this.isOutside(e.clientX, e.clientY);
193 |       a.rot = this.rotationFor(e.clientX - a.x0, e.clientY - a.y0);
194 |       this.h.preview(a.col, a.rot, a.outside);
195 |     });
```

- L186: 操作中の指以外の動きは無視。
- L188–191: マウスで左を押したまま右ボタンを押すと、`pointerdown` ではなく `pointermove` で届く（同じマウスの中でボタンが増えただけなので）。`e.buttons` は押されているボタンの組み合わせをビットで表した数で、`& 2` で「右ボタンが押されているか」を取り出せる。押されていたらキャンセル。
- L192: 盤面から十分離れたか。
- L193: 置いた位置からどれだけ動いたかで向きを決める。
- L194: プレビューを更新。

## 指を離したとき finish

**L196–206**

```ts
196 |     const finish = (e: PointerEvent, commit: boolean) => {
197 |       if (this.ignored.delete(e.pointerId)) return;
198 |       const a = this.active;
199 |       if (!a || a.id !== e.pointerId) return;
200 |       this.active = null;
201 |       this.h.preview(a.col, a.rot, false);
202 |       if (commit && !a.outside && this.h.canControl()) this.h.pointerPlace(a.col, a.rot);
203 |     };
204 |     canvas.addEventListener('pointerup', (e) => finish(e, true));
205 |     canvas.addEventListener('pointercancel', (e) => finish(e, false));
206 |   }
```

`pointerup`（普通に離した）と `pointercancel`（電話がかかってきた等でブラウザが操作を打ち切った）の両方から呼ぶ共通の処理。
- L197: キャンセルに使った指なら何もしない。`Set.delete` は「消せたら true」を返すので、確認と削除を1行でできる。
- L200–201: 操作中を解除し、キャンセル表示を消す。
- L202: 普通に離した、かつ盤面外ではない、かつ操作できる状態なら置く。

## 取り消し cancel

**L207–217**

```ts
207 | 
208 |   /** 操作中の指を取り消す */
209 |   cancel(): void {
210 |     const a = this.active;
211 |     if (!a) return;
212 |     this.active = null;
213 |     this.ignored.add(a.id);
214 |     this.h.preview(a.col, a.rot, false);
215 |     this.h.cancelled();
216 |   }
217 | 
```

操作中の指を取り消す。その指を `ignored` に入れておくので、後で離しても置かれない。

## フリックの向き rotationFor

**L218–223**

```ts
218 |   private rotationFor(dx: number, dy: number): Rotation {
219 |     if (Math.hypot(dx, dy) < this.threshold) return 0;
220 |     if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 1 : 3;
221 |     return dy > 0 ? 2 : 0;
222 |   }
223 | }
```

指の移動量 (dx, dy) から子ぷよの向きを決める。
- L219: 移動距離（`Math.hypot` は √(dx² + dy²)）がしきい値未満ならタップ扱いで「上」。
- L220: 横の動きのほうが大きければ、右なら1、左なら3。
- L221: 縦の動きのほうが大きければ、下なら2、上なら0（画面の座標は下が＋なので `dy > 0` が下）。
