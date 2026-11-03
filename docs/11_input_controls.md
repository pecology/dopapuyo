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

**L5–30**

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
 21 |   /** 今の操作位置（列と向き） */
 22 |   cursor(): { col: number; rot: Rotation };
 23 |   /** 1手戻す（ペナルティ付き） */
 24 |   undo(): void;
 25 |   retry(): void;
 26 |   newSeed(): void;
 27 |   menu(): void;
 28 |   start(): void;
 29 | }
 30 | 
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
- `cursor()` … 今の操作位置（列と向き）を教えてもらう。両手モードで、指を置いたときの列・向きを起点にするのに使う。
- `undo()` / `retry()` / `newSeed()` / `menu()` / `start()` … 1手戻す、リトライ、新しいシード、メニューへ、スタート。

**L31–33**

```ts
 31 | const DIRECT_COLUMNS = ['KeyH', 'KeyJ', 'KeyK', 'KeyL', 'Semicolon', 'Quote'];
 32 | const DIRECT_ROT: Record<string, Rotation> = { KeyW: 0, KeyD: 1, KeyS: 2, KeyA: 3 };
 33 | 
```

直接指定方式のキー割り当て。
- `DIRECT_COLUMNS` … 列1〜6に対応するキー。配列の何番目かがそのまま列番号になる。
- `DIRECT_ROT` … W=上、D=右、S=下、A=左。

ここで使っている `'KeyH'` などは `KeyboardEvent.code` の値で、**キーボード上の物理的な位置**を表す。日本語配列でも英語配列でも同じ位置のキーなら同じ値になるので、配列の違いを気にしなくてよい（`'Quote'` は英語配列の `'` の位置で、日本語配列では `:` のキー）。

## キーボード入力 Keyboard

**L34–38**

```ts
 34 | /** キーボード入力。矢印キー方式は独自の DAS/ARR で長押し移動する */
 35 | export class Keyboard {
 36 |   scheme: ControlScheme = 'arrow';
 37 |   private held: { dir: -1 | 1; since: number; last: number; charged: boolean } | null = null;
 38 | 
```

- `scheme` … 今の操作方式。オプションを変えると `main.ts` が書き換える。
- `held` … 左右キーを押しっぱなしにしている状態。押している方向、押し始めた時刻、最後に動いた時刻、連続移動が始まったか。押していなければ `null`。

**L39–44**

```ts
 39 |   constructor(private h: ControlHandlers) {
 40 |     window.addEventListener('keydown', (e) => this.onDown(e));
 41 |     window.addEventListener('keyup', (e) => this.onUp(e));
 42 |     window.addEventListener('blur', () => (this.held = null));
 43 |   }
 44 | 
```

コンストラクタで、ページ全体（`window`）のキー入力を監視する。
- `addEventListener('keydown', 関数)` … キーが押されたら関数を呼ぶ。
- `blur` … ウィンドウからフォーカスが外れた（別のアプリに切り替えた）とき。キーを離したことが伝わらない場合があるので、押しっぱなし状態を解除しておく。
- `(e) => this.onDown(e)` のように矢印関数で包んでいるのは、`onDown` の中の `this` がこのクラスを指すようにするため。

## キーが押されたとき onDown

**L45–50**

```ts
 45 |   private onDown(e: KeyboardEvent): void {
 46 |     const target = e.target as HTMLElement | null;
 47 |     if (target && (target.tagName === 'INPUT' || target.tagName === 'SELECT')) return;
 48 |     // フォーカス中のボタンは Enter / Space でそのボタン自身を押す
 49 |     if (target?.tagName === 'BUTTON' && (e.code === 'Enter' || e.code === 'Space')) return;
 50 | 
```

- L46–47: 文字入力欄（シード番号の入力など）で打っているときは、ゲーム操作として扱わない。
- L49: ボタンにフォーカスがあるときの Enter / Space は、ブラウザの標準動作（そのボタンを押す）に任せる。ここで横取りすると、メニューで「ランキング」ボタンを選んで Enter を押したのにゲームが始まってしまう。

**L51–75**

```ts
 51 |     switch (e.code) {
 52 |       case 'KeyQ':
 53 |       case 'Backspace':
 54 |         e.preventDefault();
 55 |         if (!e.repeat) this.h.undo();
 56 |         return;
 57 |       case 'KeyR':
 58 |         e.preventDefault();
 59 |         if (!e.repeat) this.h.retry();
 60 |         return;
 61 |       case 'KeyN':
 62 |         e.preventDefault();
 63 |         if (!e.repeat) this.h.newSeed();
 64 |         return;
 65 |       case 'Escape':
 66 |         e.preventDefault();
 67 |         this.h.menu();
 68 |         return;
 69 |       case 'Enter':
 70 |       case 'Space':
 71 |         if (!e.repeat) this.h.start();
 72 |         e.preventDefault();
 73 |         return;
 74 |     }
 75 | 
```

どの操作方式でも共通のキー。`switch (e.code)` で押されたキーごとに分ける。`case` を2つ並べると「どちらでも同じ処理」。
- `e.preventDefault()` … ブラウザの標準動作を止める。たとえば Backspace で前のページに戻る、Space でページがスクロールする、といった動作を防ぐ。
- `e.repeat` … キーを押しっぱなしにしたときに OS が自動で繰り返し送ってくる入力なら true。リトライや1手戻すが連打されないよう、繰り返しは無視する。

**L76–80**

```ts
 76 |     if (e.repeat) {
 77 |       if (e.code.startsWith('Arrow')) e.preventDefault();
 78 |       return;
 79 |     }
 80 | 
```

ここから先は押しっぱなしの繰り返し入力を無視する（左右の連続移動は、OS の繰り返しではなく自前の DAS/ARR で行うため）。
矢印キーの繰り返しも `preventDefault` しておかないと、ページがスクロールしてしまうことがある。

**L81–103**

```ts
 81 |     if (this.scheme === 'arrow') {
 82 |       switch (e.code) {
 83 |         case 'ArrowLeft':
 84 |         case 'ArrowRight': {
 85 |           e.preventDefault();
 86 |           const dir = e.code === 'ArrowLeft' ? -1 : 1;
 87 |           const now = performance.now();
 88 |           this.held = { dir, since: now, last: now, charged: false };
 89 |           if (this.h.canControl()) this.h.move(dir);
 90 |           return;
 91 |         }
 92 |         case 'KeyZ':
 93 |           if (this.h.canControl()) this.h.rotate(-1);
 94 |           return;
 95 |         case 'KeyX':
 96 |           if (this.h.canControl()) this.h.rotate(1);
 97 |           return;
 98 |         case 'ArrowDown':
 99 |         case 'ArrowUp':
100 |           e.preventDefault();
101 |           if (this.h.canControl()) this.h.place();
102 |           return;
103 |       }
```

矢印キー方式。
- L83–91: ←→。押した瞬間に1列動かし、押しっぱなし状態を記録する。続きの連続移動は `update()` で行う。`case` の中を `{ ... }` で囲んでいるのは、その中で `const` を宣言するため。
- L92–97: Z で左回転（-1）、X で右回転（+1）。
- L98–102: ↓ か ↑ で置く。

**L104–116**

```ts
104 |     } else {
105 |       if (e.code in DIRECT_ROT) {
106 |         if (this.h.canControl()) this.h.setRotation(DIRECT_ROT[e.code]);
107 |         return;
108 |       }
109 |       const col = DIRECT_COLUMNS.indexOf(e.code);
110 |       if (col >= 0) {
111 |         e.preventDefault();
112 |         if (this.h.canControl()) this.h.placeAt(col);
113 |       }
114 |     }
115 |   }
116 | 
```

直接指定方式。
- L105: `e.code in DIRECT_ROT` … 押したキーが W/A/S/D のどれかなら（`in` は「オブジェクトにそのキーがあるか」）、向きを変える。
- L109–113: `indexOf` で列キーの何番目かを調べ、見つかれば（-1 でなければ）その列に置く。

## キーが離されたとき onUp

**L117–123**

```ts
117 |   private onUp(e: KeyboardEvent): void {
118 |     if (!this.held) return;
119 |     if ((e.code === 'ArrowLeft' && this.held.dir === -1) || (e.code === 'ArrowRight' && this.held.dir === 1)) {
120 |       this.held = null;
121 |     }
122 |   }
123 | 
```

押しっぱなしにしていた方向のキーが離されたら、押しっぱなし状態を解除する。←を押したまま→を押して←を離した、のような場合に、関係ないキーで解除しないよう方向を確かめている。

## 長押しの連続移動 update

**L124–132**

```ts
124 |   /** 毎フレーム呼ぶ（長押しの連続移動） */
125 |   update(now: number): void {
126 |     const held = this.held;
127 |     if (!held || this.scheme !== 'arrow' || !this.h.canControl()) return;
128 |     if (!held.charged) {
129 |       if (now - held.since < CONFIG.DAS_MS) return;
130 |       held.charged = true;
131 |       held.last = now - CONFIG.ARR_MS;
132 |     }
```

`main.ts` から毎フレーム呼ばれる。
- L127: 押していない、矢印キー方式でない、操作できない状態なら何もしない。
- L128–132: まだ連続移動が始まっていないとき。押してから `DAS_MS`（110ms）経つまでは待つ。経ったら連続移動を開始し、すぐ1回動くように「最後に動いた時刻」を1間隔ぶん前にしておく。

**L133–147**

```ts
133 |     if (CONFIG.ARR_MS <= 0) {
134 |       this.h.moveToWall(held.dir);
135 |       return;
136 |     }
137 |     let guard = COLS;
138 |     while (now - held.last >= CONFIG.ARR_MS && guard-- > 0) {
139 |       held.last += CONFIG.ARR_MS;
140 |       if (!this.h.move(held.dir)) {
141 |         held.last = now;
142 |         break;
143 |       }
144 |     }
145 |   }
146 | }
147 | 
```

- L133–136: 間隔が0の設定なら、壁まで一気に動かす。
- L137–144: 前回動いてから `ARR_MS`（25ms）経つごとに1列動かす。フレームの間隔が空いて2回ぶん以上経っていれば、その回数ぶん動かす（`while`）。
  - `guard` … 万一の無限ループ防止。最大6回で止める。`guard-- > 0` は「比べてから1減らす」。
  - L140–143: 壁にぶつかって動けなければ、ループを抜ける。

## タッチ／マウス入力 Pointer

**L148–158**

```ts
148 | /**
149 |  * タッチ／マウス: タップした列＝軸ぷよの列、フリック方向＝子ぷよの向き。
150 |  * 指を置いている間はプレビュー、離した時点で設置。
151 |  * 取り消し: 盤面の外まで引っぱって離す／2本目の指でタップ／右クリック。
152 |  */
153 | export class Pointer {
154 |   enabled = true;
155 |   threshold = 24;
156 |   private active: { id: number; x0: number; y0: number; col: number; rot: Rotation; outside: boolean } | null = null;
157 |   /** キャンセルに使った指（離したときに何もしないよう覚えておく） */
158 |   private ignored = new Set<number>();
```

**Pointer Events** という仕組みを使う。マウス・タッチ・ペンをまとめて同じイベント（`pointerdown`、`pointermove`、`pointerup`）で扱える。指が複数あるときは `pointerId` で区別する。
- `enabled` … この操作方式を使うか。オプションで両手モードを選ぶと false になり、指を置いても反応しない。
- `threshold` … これ以上動かしたらフリックとみなす距離（px）。オプションで変えられる。
- `active` … 今操作中の指。どの指か、置いた位置、選んだ列と向き、盤面外にいるか。
- `ignored` … キャンセルに使った指。その指を離したときに「置く」処理が走らないよう覚えておく。

**L160–169**

```ts
160 |   constructor(
161 |     canvas: HTMLCanvasElement,
162 |     private columnAt: (cx: number, cy: number) => number | null,
163 |     private isOutside: (cx: number, cy: number) => boolean,
164 |     private h: ControlHandlers,
165 |   ) {
166 |     canvas.addEventListener('contextmenu', (e) => {
167 |       e.preventDefault();
168 |       this.cancel();
169 |     });
```

- コンストラクタの引数で、列を求める関数・盤面外かを判定する関数（どちらも renderer のもの）と、操作の一覧を受け取る。
- L166–169: 右クリックでブラウザのメニューが出ないようにし（`preventDefault`）、操作中ならキャンセルする。

## 指を置いたとき pointerdown

**L170–186**

```ts
170 |     canvas.addEventListener('pointerdown', (e) => {
171 |       // 操作中にもう1本の指・右クリックが来たらキャンセル
172 |       if (this.active) {
173 |         e.preventDefault();
174 |         this.ignored.add(e.pointerId);
175 |         this.cancel();
176 |         return;
177 |       }
178 |       if (!this.enabled || e.button === 2) return;
179 |       if (!this.h.canControl()) return;
180 |       const col = this.columnAt(e.clientX, e.clientY);
181 |       if (col === null) return;
182 |       e.preventDefault();
183 |       canvas.setPointerCapture(e.pointerId);
184 |       this.active = { id: e.pointerId, x0: e.clientX, y0: e.clientY, col, rot: 0, outside: false };
185 |       this.h.preview(col, 0, false);
186 |     });
```

- L172–177: すでに別の指で操作中なのに新しい指（またはマウスの別ボタン）が来たら、それは「2本目の指でタップ」なのでキャンセルする。その2本目の指も、離したときに何もしないよう `ignored` に入れる。
- L178: 両手モードのとき（`enabled` が false）と、右ボタンだけで押した場合は何もしない。`button` は 0=左、2=右。
- L179: 連鎖演出中などは受け付けない。
- L180–181: 触った位置の列を求める。盤面から外れていれば無視。
- L183: `setPointerCapture` … 指が canvas の外に出ても、離すまでこの canvas にイベントが届き続けるようにする。盤面外まで引っぱってキャンセル、をするのに必要。
- L184–185: 操作中の指として記録し、「子が上」の向きでプレビューを出す。

## 指を動かしたとき pointermove

**L187–198**

```ts
187 |     canvas.addEventListener('pointermove', (e) => {
188 |       const a = this.active;
189 |       if (!a || a.id !== e.pointerId) return;
190 |       // 左ボタンを押したまま右ボタンを押した（同じマウスなので pointerdown ではなく move で届く）
191 |       if (e.pointerType === 'mouse' && e.buttons & 2) {
192 |         this.cancel();
193 |         return;
194 |       }
195 |       a.outside = this.isOutside(e.clientX, e.clientY);
196 |       a.rot = this.rotationFor(e.clientX - a.x0, e.clientY - a.y0);
197 |       this.h.preview(a.col, a.rot, a.outside);
198 |     });
```

- L189: 操作中の指以外の動きは無視。
- L191–194: マウスで左を押したまま右ボタンを押すと、`pointerdown` ではなく `pointermove` で届く（同じマウスの中でボタンが増えただけなので）。`e.buttons` は押されているボタンの組み合わせをビットで表した数で、`& 2` で「右ボタンが押されているか」を取り出せる。押されていたらキャンセル。
- L195: 盤面から十分離れたか。
- L196: 置いた位置からどれだけ動いたかで向きを決める。
- L197: プレビューを更新。

## 指を離したとき finish

**L199–209**

```ts
199 |     const finish = (e: PointerEvent, commit: boolean) => {
200 |       if (this.ignored.delete(e.pointerId)) return;
201 |       const a = this.active;
202 |       if (!a || a.id !== e.pointerId) return;
203 |       this.active = null;
204 |       this.h.preview(a.col, a.rot, false);
205 |       if (commit && !a.outside && this.h.canControl()) this.h.pointerPlace(a.col, a.rot);
206 |     };
207 |     canvas.addEventListener('pointerup', (e) => finish(e, true));
208 |     canvas.addEventListener('pointercancel', (e) => finish(e, false));
209 |   }
```

`pointerup`（普通に離した）と `pointercancel`（電話がかかってきた等でブラウザが操作を打ち切った）の両方から呼ぶ共通の処理。
- L200: キャンセルに使った指なら何もしない。`Set.delete` は「消せたら true」を返すので、確認と削除を1行でできる。
- L203–204: 操作中を解除し、キャンセル表示を消す。
- L205: 普通に離した、かつ盤面外ではない、かつ操作できる状態なら置く。

## 取り消し cancel

**L210–220**

```ts
210 | 
211 |   /** 操作中の指を取り消す */
212 |   cancel(): void {
213 |     const a = this.active;
214 |     if (!a) return;
215 |     this.active = null;
216 |     this.ignored.add(a.id);
217 |     this.h.preview(a.col, a.rot, false);
218 |     this.h.cancelled();
219 |   }
220 | 
```

操作中の指を取り消す。その指を `ignored` に入れておくので、後で離しても置かれない。

## フリックの向き rotationFor

**L221–224**

```ts
221 |   private rotationFor(dx: number, dy: number): Rotation {
222 |     return flickRotation(dx, dy, this.threshold) ?? 0;
223 |   }
224 | }
```

指の移動量 (dx, dy) から子ぷよの向きを決める。計算は下の `flickRotation`（両手モードと共通）に任せ、しきい値に届かない（`null` が返る）ときはタップ扱いで「上」(0) にする。
`??` は「左が `null` か `undefined` なら右の値を使う」という演算子。

## フリック方向から向きを求める flickRotation

**L225–231**

```ts
225 | 
226 | /** フリック方向から子ぷよの向きを求める。しきい値に届かなければ null */
227 | function flickRotation(dx: number, dy: number, threshold: number): Rotation | null {
228 |   if (Math.hypot(dx, dy) < threshold) return null;
229 |   if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 1 : 3;
230 |   return dy > 0 ? 2 : 0;
231 | }
```

- L228: 移動距離（`Math.hypot` は √(dx² + dy²)）がしきい値未満なら、まだフリックしていないので `null`。
- L229: 横の動きのほうが大きければ、右なら1、左なら3。
- L230: 縦の動きのほうが大きければ、下なら2、上なら0（画面の座標は下が＋なので `dy > 0` が下）。

## 両手モード TwoHand

スマホを両手で持ち、左手の親指で列、右手の親指で子ぷよの向きを決める操作方式。オプションの「タッチ操作」で片手（`Pointer`）と切り替える。
2本の指を同時に置き、**どちらを先に離すか**で「置く」と「やめる」を区別するのが特徴。

**L232–247**

```ts
232 | 
233 | /**
234 |  * 両手モード（タッチ）: 画面の左半分で列、右半分で子ぷよの向きを決める。
235 |  * - 左の指: 横にスワイプした距離で列を動かす（columnStep px で1列）
236 |  * - 右の指: フリック方向＝子ぷよの向き。フリックしなければ指を置いたときの向きのまま
237 |  * - 右を先に離すと設置、左を先に離すとキャンセル。右だけで操作したときは今の列に置く
238 |  */
239 | export class TwoHand {
240 |   enabled = false;
241 |   threshold = 24;
242 |   columnStep = 32;
243 |   private left: { id: number; x0: number; col0: number; col: number } | null = null;
244 |   private right: { id: number; x0: number; y0: number; rot0: Rotation; rot: Rotation } | null = null;
245 |   /** 設置・キャンセル後もまだ触れている指（離したときに何もしないよう覚えておく） */
246 |   private ignored = new Set<number>();
247 | 
```

- `enabled` … 両手モードを選んでいるときだけ true。
- `threshold` … フリックとみなす距離（片手モードと同じオプションの値）。
- `columnStep` … 左の指を何px横に動かすと1列動くか（オプションで変えられる）。
- `left` … 左半分に置いた指。どの指か（`id`）、置いた x 座標、置いたときの列（`col0`）、今の列（`col`）。
- `right` … 右半分に置いた指。置いた座標、置いたときの向き（`rot0`）、今の向き（`rot`）。
- `ignored` … 置いた・やめた後もまだ画面に触れている指。その指を離したときに何も起きないよう覚えておく。

**L248–256**

```ts
248 |   constructor(
249 |     private canvas: HTMLCanvasElement,
250 |     private h: ControlHandlers,
251 |   ) {
252 |     canvas.addEventListener('pointerdown', (e) => this.onDown(e));
253 |     canvas.addEventListener('pointermove', (e) => this.onMove(e));
254 |     canvas.addEventListener('pointerup', (e) => this.onUp(e, true));
255 |     canvas.addEventListener('pointercancel', (e) => this.onUp(e, false));
256 |   }
```

盤面の canvas に、指を置く・動かす・離す・（OS などに）取り上げられる、の4つのイベントを登録する。`Pointer` と同じ canvas に登録するが、`enabled` で片方だけが反応する。

### 指を置いたとき onDown

**L257–273**

```ts
257 | 
258 |   private onDown(e: PointerEvent): void {
259 |     if (!this.enabled || e.button === 2) return;
260 |     e.preventDefault();
261 |     const rect = this.canvas.getBoundingClientRect();
262 |     const isLeft = e.clientX < rect.left + rect.width / 2;
263 |     // 同じ側に2本目の指が来た・操作できない間に触れた指は無視する
264 |     if ((isLeft ? this.left : this.right) || !this.h.canControl()) {
265 |       this.ignored.add(e.pointerId);
266 |       return;
267 |     }
268 |     this.canvas.setPointerCapture(e.pointerId);
269 |     const cur = this.h.cursor();
270 |     if (isLeft) this.left = { id: e.pointerId, x0: e.clientX, col0: cur.col, col: cur.col };
271 |     else this.right = { id: e.pointerId, x0: e.clientX, y0: e.clientY, rot0: cur.rot, rot: cur.rot };
272 |     this.show();
273 |   }
```

- L261–262: canvas の左端から幅の半分までを「左半分」とする。`getBoundingClientRect()` は要素の画面上の位置と大きさ。
- L264–267: すでに同じ側に指がある、または連鎖演出中などで操作できないときは、その指を無視する。
- L268: 指が canvas の外に出ても、離すまでイベントが届くようにする。
- L269–271: 今の列・向きを起点として、左右どちらの指かを記録する。
- L272: 置き先のプレビューを出す。

### 指を動かしたとき onMove

**L274–287**

```ts
274 | 
275 |   private onMove(e: PointerEvent): void {
276 |     const l = this.left;
277 |     const r = this.right;
278 |     if (l && l.id === e.pointerId) {
279 |       const col = l.col0 + Math.round((e.clientX - l.x0) / this.columnStep);
280 |       l.col = Math.min(COLS - 1, Math.max(0, col));
281 |     } else if (r && r.id === e.pointerId) {
282 |       r.rot = flickRotation(e.clientX - r.x0, e.clientY - r.y0, this.threshold) ?? r.rot0;
283 |     } else {
284 |       return;
285 |     }
286 |     this.show();
287 |   }
```

- L279–280: 左の指は、置いた位置から横に動いた距離を `columnStep` で割って四捨五入（`Math.round`）し、その列数だけずらす。0〜5列目からはみ出さないよう `Math.min` / `Math.max` で押さえる。
- L282: 右の指は、動いた方向から子ぷよの向きを決める。まだフリックの距離に届いていなければ、置いたときの向きのまま。
- L283–285: 両手モードで使っていない指なら何もしない。

### 指を離したとき onUp

**L288–303**

```ts
288 | 
289 |   private onUp(e: PointerEvent, commit: boolean): void {
290 |     if (this.ignored.delete(e.pointerId)) return;
291 |     const l = this.left;
292 |     const r = this.right;
293 |     if (r && r.id === e.pointerId) {
294 |       const { col, rot } = this.state();
295 |       this.release(e.pointerId);
296 |       if (commit && this.h.canControl()) this.h.pointerPlace(col, rot);
297 |     } else if (l && l.id === e.pointerId) {
298 |       // 左を先に離した＝キャンセル。列は指を置く前に戻す
299 |       this.h.preview(l.col0, r ? r.rot0 : this.h.cursor().rot, false);
300 |       this.release(e.pointerId);
301 |       if (r) this.h.cancelled();
302 |     }
303 |   }
```

- L290: 無視する指なら、覚えていたのを消して終わり（`Set` の `delete` は、消せたら true を返す）。
- L293–296: **右の指を離した＝置く**。左の指がまだ触れていれば、その列に置く。右だけで操作していたなら今の列に置く。`commit` が false（`pointercancel`）のときは置かない。
- L297–301: **左の指を先に離した＝やめる**。列と向きを指を置く前に戻す。右の指も触れていたときだけ、キャンセル音を鳴らす。

**L304–321**

```ts
304 | 
305 |   /** 操作を終える。離した指以外でまだ触れている指は、離すまで無視する */
306 |   private release(liftedId: number): void {
307 |     for (const f of [this.left, this.right]) if (f && f.id !== liftedId) this.ignored.add(f.id);
308 |     this.left = null;
309 |     this.right = null;
310 |   }
311 | 
312 |   private state(): { col: number; rot: Rotation } {
313 |     const cur = this.h.cursor();
314 |     return { col: this.left ? this.left.col : cur.col, rot: this.right ? this.right.rot : cur.rot };
315 |   }
316 | 
317 |   private show(): void {
318 |     const { col, rot } = this.state();
319 |     this.h.preview(col, rot, false);
320 |   }
321 | }
```

- `release` … 操作を終える。たとえば右を離して置いたとき、左の指はまだ触れているので `ignored` に入れ、後で離しても「キャンセル」にならないようにする。
- `state` … 今の列と向き。左の指があればその列、右の指があればその向き、なければ今のカーソルのものを使う。
- `show` … 置き先のプレビューを出す。
