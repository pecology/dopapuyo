# src/main.ts

アプリ全体を組み立てて動かす、一番上のファイル。`index.html` から最初に読み込まれる。

担当していること:
- 画面の状態（メニュー／プレイ中／結果）の切り替え
- 入力（controls.ts）から頼まれた操作を、ゲーム（game.ts）に伝える
- **時間の管理**。いつ始まったか、演出中で操作できないのはいつまでか、いつ終わったか、ペナルティはいくらか
- 毎フレームの処理（演出のきっかけを出す、HUDを更新する、描画を頼む）
- メニュー・オプション・ランキング・結果画面の中身を作る

時刻はすべて `performance.now()` で取る。ページを開いてからの経過ミリ秒で、小数まで正確。`Date.now()` と違い、パソコンの時計を合わせ直しても影響されない。

## 読み込み

**L1–19**

```ts
  1 | import './style.css';
  2 | import { registerSW } from 'virtual:pwa-register';
  3 | import { CONFIG, configSignature } from './config';
  4 | import { sound } from './audio/sound';
  5 | import { Field, clampPlacement, type Rotation } from './core/field';
  6 | import { Game } from './core/game';
  7 | import { randomSeed } from './core/tsumo';
  8 | import { Keyboard, Pointer, TwoHand, type ControlHandlers } from './input/controls';
  9 | import { Renderer, type Cursor, type TurnAnimation } from './render/renderer';
 10 | import {
 11 |   clearRecords,
 12 |   getRanking,
 13 |   loadOptions,
 14 |   saveOptions,
 15 |   submitRecord,
 16 |   type Options,
 17 |   type RunRecord,
 18 | } from './storage';
 19 | 
```

- L1: CSS を読み込む。Vite がこれを見てページにスタイルを適用する（`vite-env.d.ts` の宣言で TypeScript にも CSS の import を許可している）。
- L2: オフライン対応（PWA）の登録をする関数。`virtual:pwa-register` は実際のファイルではなく、ビルドの道具（vite-plugin-pwa）がその場で用意するモジュール。
- L3–18: 各ファイルから必要なものを読み込む。`import { ... } from` を複数行に分けて書くこともできる。


## 画面の部品を取ってくる

**L20–22**

```ts
 20 | // ---------- DOM ----------
 21 | const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
 22 | const canvas = $<HTMLCanvasElement>('board');
```

- L21: `$` という短い名前の関数を作る。`document.getElementById(id)` で HTML の部品を id で探す。
  - `<T extends HTMLElement = HTMLElement>` はジェネリクス。`$<HTMLButtonElement>('undo')` のように書くと「ボタンとして」取り出せて、ボタン専用の機能（`disabled` など）が使える。何も書かなければ普通の HTML 要素。
  - `as T` は「この型だと思って扱ってよい」という指定。
- L22: 盤面を描く canvas。

**L23–48**

```ts
 23 | const ui = {
 24 |   time: $('time'),
 25 |   score: $('score'),
 26 |   target: $('target'),
 27 |   bar: $('bar'),
 28 |   seed: $('seed'),
 29 |   maxchain: $('maxchain'),
 30 |   moves: $('moves'),
 31 |   keyhelp: $('keyhelp'),
 32 |   penalty: $('penalty'),
 33 |   undo: $<HTMLButtonElement>('undo'),
 34 |   resultUndo: $<HTMLButtonElement>('result-undo'),
 35 |   menu: $('menu'),
 36 |   options: $('options'),
 37 |   ranking: $('ranking'),
 38 |   result: $('result'),
 39 |   targets: $('targets'),
 40 |   seedRandom: $<HTMLButtonElement>('seed-random'),
 41 |   seedFixed: $<HTMLButtonElement>('seed-fixed'),
 42 |   seedInput: $<HTMLInputElement>('seed-input'),
 43 |   howto: $('howto'),
 44 |   rankTabs: $('rank-tabs'),
 45 |   rankBody: $('rank-body'),
 46 |   rankNote: $('rank-note'),
 47 | };
 48 | 
```

よく使う画面の部品をまとめて取り出し、`ui.time` のような名前で使えるようにしておく。毎回 `getElementById` するより速く、書くのも楽。

## 表示用の小さな関数

**L49–56**

```ts
 49 | // ---------- 表示用ユーティリティ ----------
 50 | export function formatTime(ms: number): string {
 51 |   const cs = Math.floor(Math.max(0, ms) / 10);
 52 |   const m = Math.floor(cs / 6000);
 53 |   const s = Math.floor((cs % 6000) / 100);
 54 |   const c = cs % 100;
 55 |   return `${m}:${String(s).padStart(2, '0')}.${String(c).padStart(2, '0')}`;
 56 | }
```

`formatTime(ms)` … ミリ秒を `1:23.45` の形にする。
- L51: 1/100秒単位（センチ秒）に直す。`Math.max(0, ms)` で負にならないようにする。
- L52: 分 = 6000センチ秒ごとに1。
- L53: 秒 = 分を除いた残りを100で割る。
- L54: 1/100秒の部分。
- L55: `padStart(2, '0')` で、1桁なら頭に0をつけて2桁にする（`5` → `05`）。

**L57–59**

```ts
 57 | const fmt = (n: number) => n.toLocaleString('en-US');
 58 | const targetLabel = (t: number) => (t >= 10_000 ? `${t / 10_000}万` : fmt(t));
 59 | 
```

- `fmt(n)` … 3桁ごとにカンマ（`100000` → `100,000`）。
- `targetLabel(t)` … 目標点を「10万」「1000万」のような日本語表記にする。

## アプリの状態

**L60–62**

```ts
 60 | // ---------- 状態 ----------
 61 | type Mode = 'menu' | 'playing' | 'result';
 62 | 
```

`Mode` … 今どの画面か。`'menu'`（メニュー）、`'playing'`（プレイ中）、`'result'`（結果画面）。

**L63–83**

```ts
 63 | let options: Options = loadOptions();
 64 | let mode: Mode = 'menu';
 65 | let target = CONFIG.TARGETS[0];
 66 | let seedMode: 'random' | 'fixed' = 'random';
 67 | let game: Game | null = null;
 68 | let cursor: Cursor = { x: 2, rot: 0 };
 69 | let anim: TurnAnimation | null = null;
 70 | let firedPops = 0;
 71 | let startAt = 0;
 72 | let busyUntil = 0;
 73 | let endAt: number | null = null;
 74 | let endHandled = false;
 75 | let shownScore = 0;
 76 | let revealedScore = 0;
 77 | let revealedMaxChain = 0;
 78 | /** 1手戻したぶんの合計ペナルティ */
 79 | let penaltyMs = 0;
 80 | /** タッチ/マウスで「離すとキャンセル」の位置にいる */
 81 | let cancelHint = false;
 82 | let rankTarget = target;
 83 | 
```

アプリ全体で使う変数。`let` なので途中で値が変わる。
- `options` … オプション設定。起動時に保存データから読み込む。
- `target` … 選んでいる目標点。`seedMode` … シードの選び方。
- `game` … 今のゲーム。メニュー中は `null`。
- `cursor` … 操作中ペアの位置と向き。
- `anim` … 再生中の1手のアニメーション。`firedPops` … そのうち何連鎖目まで「消えた瞬間の処理」を済ませたか。
- `startAt` … ゲーム開始時刻。
- `busyUntil` … この時刻までは演出中で操作できない。
- `endAt` … ゲームが終わる（最後の連鎖が終わる）時刻。まだなら `null`。`endHandled` … 終了処理を済ませたか。
- `shownScore` … 画面に出しているスコア（カウントアップ演出のため、本当の値に向かって少しずつ増える）。
- `revealedScore` … 演出上、もう明かしてよいスコア。ゲームの内部では置いた瞬間に連鎖の点数まで確定しているが、画面では連鎖が消えるたびに足していきたいので、別に持っている。
- `revealedMaxChain` … 同じ考え方で、表示用の最大連鎖。
- `penaltyMs` … 1手戻したペナルティの合計。
- `cancelHint` … 「離すとキャンセル」表示中か。
- `rankTarget` … ランキング画面で選んでいる目標点。

**L84–85**

```ts
 84 | const renderer = new Renderer(canvas);
 85 | 
```

描画担当を作る。

## ゲーム操作

**L86–90**

```ts
 86 | // ---------- ゲーム操作 ----------
 87 | function canControl(): boolean {
 88 |   return mode === 'playing' && !!game && !game.finished && performance.now() >= busyUntil;
 89 | }
 90 | 
```

`canControl()` … 操作を受け付けてよいか。プレイ中で、ゲームがあって、終わっていなくて、演出が終わっている。`!!game` は「game が null でなければ true」にする書き方。

## ゲーム開始 startGame

**L91–114**

```ts
 91 | function startGame(seed: number): void {
 92 |   sound.unlock();
 93 |   game = new Game(seed, target);
 94 |   cursor = { x: 2, rot: 0 };
 95 |   anim = null;
 96 |   firedPops = 0;
 97 |   busyUntil = 0;
 98 |   endAt = null;
 99 |   endHandled = false;
100 |   shownScore = 0;
101 |   revealedScore = 0;
102 |   revealedMaxChain = 0;
103 |   penaltyMs = 0;
104 |   cancelHint = false;
105 |   ui.penalty.hidden = true;
106 |   ui.score.style.minWidth = `${fmt(target).length}ch`;
107 |   renderer.clearEffects();
108 |   mode = 'playing';
109 |   showOverlay(null);
110 |   ui.seed.textContent = String(seed);
111 |   ui.target.textContent = fmt(target);
112 |   startAt = performance.now();
113 | }
114 | 
```

- L92: 音を使えるようにする（ボタンやキーを押した直後なのでブラウザが許可してくれる）。
- L93: 新しいゲームを作る。
- L94–105: 状態をすべて初期化。
- L106: スコアの表示幅を、目標点の桁数ぶん確保する（`ch` は数字1文字ぶんの幅）。点数が増えて桁が増えても横にずれないようにするため。
- L107–111: エフェクトを消し、プレイ中にして、画面の上に重なっている画面を全部閉じ、シードと目標点を表示。
- L112: 最後に開始時刻を記録。準備の処理時間がタイムに入らないよう、一番最後に取る。

**L115–121**

```ts
115 | function canUndo(): boolean {
116 |   if (!game || !game.canUndo() || performance.now() < busyUntil) return false;
117 |   if (mode === 'playing') return true;
118 |   // 窒息した直後（結果画面）からも戻せる
119 |   return mode === 'result' && game.finished === 'dead';
120 | }
121 | 
```

`canUndo()` … 今1手戻せるか。演出中は不可。プレイ中なら可、結果画面なら窒息したときだけ可。

## 1手戻す undo

**L122–148**

```ts
122 | function undo(): void {
123 |   if (!game || !canUndo()) return;
124 |   const now = performance.now();
125 |   const prev = game.undo();
126 |   if (!prev) return;
127 |   penaltyMs += CONFIG.UNDO_PENALTY_MS;
128 |   cursor = { x: clampPlacement(prev.x, prev.rot), rot: prev.rot };
129 |   anim = null;
130 |   endAt = null;
131 |   endHandled = false;
132 |   revealedScore = game.score;
133 |   shownScore = game.score;
134 |   revealedMaxChain = game.maxChain;
135 |   renderer.clearEffects();
136 |   renderer.banner(`+${CONFIG.UNDO_PENALTY_MS / 1000}秒`, now, 600);
137 |   ui.penalty.hidden = false;
138 |   ui.penalty.textContent = `ペナルティ +${formatTime(penaltyMs)}`;
139 |   ui.penalty.classList.remove('flash');
140 |   void ui.penalty.offsetWidth;
141 |   ui.penalty.classList.add('flash');
142 |   sound.undo();
143 |   if (mode === 'result') {
144 |     mode = 'playing';
145 |     showOverlay(null);
146 |   }
147 | }
148 | 
```

- L125: ゲームに1手戻してもらう。置いていた位置と向きが返ってくる。
- L127: ペナルティを加算。タイム表示は「経過時間 + penaltyMs」なので、これで +5秒になる。
- L128: カーソルを取り消した手の位置へ。置き直しやすくするため。
- L129–134: アニメーションと終了状態を解除し、表示用のスコアなどをゲームの値に合わせる。
- L135–136: エフェクトを消して、中央に「+5秒」を出す。
- L137–141: ペナルティ表示を更新し、点滅アニメーションをかけ直す。CSS アニメーションは同じクラスを付け直しても再生されないので、一度外し、`offsetWidth` を読んでブラウザに「外した状態」を確定させてから（**リフロー**を起こす小技）付け直している。
- L143–146: 結果画面（窒息）から戻した場合は、プレイ中に戻して結果画面を閉じる。

**L149–156**

```ts
149 | function chosenSeed(): number {
150 |   if (seedMode === 'fixed') {
151 |     const v = Math.floor(Number(ui.seedInput.value));
152 |     if (v >= 1 && v <= CONFIG.SEED_COUNT) return v;
153 |   }
154 |   return randomSeed();
155 | }
156 | 
```

`chosenSeed()` … メニューの設定からシードを決める。番号指定で、入力が 1〜65536 の範囲ならその番号。それ以外（ランダム、または入力が空・範囲外）はランダム。

## 1手置く placeAt

**L157–162**

```ts
157 | function placeAt(x: number, rot: Rotation): void {
158 |   if (!game || !canControl()) return;
159 |   const now = performance.now();
160 |   const before: Field = game.field.clone();
161 |   const turn = game.place(x, rot);
162 | 
```

- L158: 操作できなければ何もしない。
- L160: 置く前の盤面を複製しておく（アニメーションで使う）。
- L161: ゲームに置いてもらう。この1行で連鎖の計算まで全部終わる。

**L163–171**

```ts
163 |   // アニメーション用に各段階の盤面を作る
164 |   const f = before.clone();
165 |   f.place(turn.pair, x, rot);
166 |   const frames = [f.clone()];
167 |   for (const step of turn.chain.steps) {
168 |     f.removeAndFall(step.cleared);
169 |     frames.push(f.clone());
170 |   }
171 |   anim = { turn, before, frames, start: now };
```

アニメーション用に、各段階の盤面を作り直す。
- 置く前の盤面の複製に同じように置き（`frames[0]`）、各連鎖の消去を順に再現して、そのたびに複製を記録する。
- ゲーム本体は最後の盤面しか持っていないので、途中の盤面はこうして作る。
- L171: アニメーションの情報をまとめる。

**L172–181**

```ts
172 |   firedPops = 0;
173 |   busyUntil = now + turn.timeline.total;
174 |   if (turn.cleared || turn.dead) endAt = busyUntil;
175 |   sound.place();
176 | 
177 |   const nextRot = options.spawnRot === 'keep' ? rot : 0;
178 |   const nextX = options.spawnCol === 'keep' ? x : 2;
179 |   cursor = { x: clampPlacement(nextX, nextRot), rot: nextRot };
180 | }
181 | 
```

- L173: 演出が終わる時刻まで操作を止める。
- L174: この手でクリアか窒息したなら、終了時刻は演出が終わる瞬間。**タイムは最後の連鎖が終わった瞬間で確定**、という仕様はここで決まる。
- L177–179: 次のペアの開始位置。向きと列はオプションで別々に決める。向きは「上に戻す」なら 0、「引き継ぐ」なら今置いた向き。列は「戻す」なら3列目（`2`）、「引き継ぐ」なら今置いた列。最後に `clampPlacement` で、横向きのときに盤面からはみ出さない列に直す。


## 入力に渡す操作の一覧 handlers

**L182–195**

```ts
182 | const handlers: ControlHandlers = {
183 |   canControl,
184 |   move(dx) {
185 |     const min = cursor.rot === 3 ? 1 : 0;
186 |     const max = cursor.rot === 1 ? 4 : 5;
187 |     const nx = cursor.x + dx;
188 |     if (nx < min || nx > max) return false;
189 |     cursor = { ...cursor, x: nx };
190 |     sound.move();
191 |     return true;
192 |   },
193 |   moveToWall(dx) {
194 |     while (handlers.move(dx));
195 |   },
```

`controls.ts` の `ControlHandlers` の形どおりに、実際の処理を書いたオブジェクト。`canControl,` は `canControl: canControl` の省略形。
- `move(dx)` … カーソルを左右に動かす。向きによって動ける範囲が違う（子が左なら1列目より左には行けない、子が右なら5列目まで）。動けたら移動音を鳴らして true。
- `moveToWall(dx)` … 動けなくなるまで `move` をくり返す。`while (条件);` は中身のない while で、条件の関数を呼ぶこと自体が処理になっている。

**L196–210**

```ts
196 |   rotate(dir) {
197 |     const rot = ((cursor.rot + dir + 4) % 4) as Rotation;
198 |     cursor = { x: clampPlacement(cursor.x, rot), rot };
199 |     sound.rotate();
200 |   },
201 |   setRotation(rot) {
202 |     cursor = { x: clampPlacement(cursor.x, rot), rot };
203 |   },
204 |   place() {
205 |     placeAt(cursor.x, cursor.rot);
206 |   },
207 |   placeAt(col) {
208 |     cursor = { ...cursor, x: col };
209 |     placeAt(col, cursor.rot);
210 |   },
```

- `rotate(dir)` … 向きを回す。`+ 4` してから `% 4` するのは、左回転で -1 になったときに `3` に戻すため（`-1 % 4` は JavaScript では `-1` になってしまう）。回した後に壁からはみ出すなら `clampPlacement` で内側にずらす（壁蹴り）。
- `setRotation(rot)` … 向きを直接指定（直接指定方式）。
- `place()` … 今のカーソル位置に置く。
- `placeAt(col)` … 指定した列に置く（直接指定方式の HJKL;'）。

**L211–225**

```ts
211 |   preview(col, rot, outside) {
212 |     cursor = { x: col, rot };
213 |     cancelHint = outside;
214 |   },
215 |   cancelled() {
216 |     cancelHint = false;
217 |     sound.cancel();
218 |   },
219 |   pointerPlace(col, rot) {
220 |     placeAt(col, rot);
221 |   },
222 |   cursor() {
223 |     return { col: cursor.x, rot: cursor.rot };
224 |   },
225 |   undo,
```

- `preview` … タッチ中、カーソルを指の位置と向きに合わせ、キャンセル表示のオンオフを覚える。
- `cancelled` … キャンセル音を鳴らす。
- `pointerPlace` … タッチで置く。
- `cursor` … 今のカーソルの列と向きを返す。両手モードが、指を置いたときの起点にする。
- `undo,` … 上で定義した `undo` 関数をそのまま渡す。


**L226–247**

```ts
226 |   retry() {
227 |     if (mode === 'menu' || !game) return;
228 |     startGame(game.seed);
229 |   },
230 |   newSeed() {
231 |     if (mode === 'menu') return;
232 |     startGame(randomSeed());
233 |   },
234 |   menu() {
235 |     // オプション・ランキングはメニューから開くので、閉じてメニューに戻る
236 |     if (!ui.options.hidden || !ui.ranking.hidden) {
237 |       showOverlay('menu');
238 |       return;
239 |     }
240 |     goMenu();
241 |   },
242 |   start() {
243 |     if (mode === 'menu' && ui.options.hidden && ui.ranking.hidden) startGame(chosenSeed());
244 |     else if (mode === 'result') startGame(game ? game.seed : chosenSeed());
245 |   },
246 | };
247 | 
```

- `retry` … 同じシードで最初から。メニュー中は何もしない。
- `newSeed` … ランダムな新しいシードで最初から。
- `menu`（Esc）… オプションやランキングを開いていればメニューに戻るだけ。そうでなければ（プレイ中・結果画面）メニューへ。
- `start`（Enter / Space）… メニュー画面ならゲーム開始。結果画面なら同じシードでもう一度。

**L248–256**

```ts
248 | const keyboard = new Keyboard(handlers);
249 | const pointer = new Pointer(
250 |   canvas,
251 |   (x, y) => renderer.columnAt(x, y),
252 |   (x, y) => renderer.isOutside(x, y),
253 |   handlers,
254 | );
255 | const twoHand = new TwoHand(canvas, handlers);
256 | 
```

キーボードとタッチの入力を作る。タッチには、列を求める関数と盤面外を判定する関数を renderer から渡す（`(x, y) => renderer.columnAt(x, y)` のように包んで渡す）。
タッチは片手モード（`Pointer`）と両手モード（`TwoHand`）の両方を作っておき、オプションで選んだほうだけを有効にする（下の `applyOptions`）。

**L257–265**

```ts
257 | function goMenu(): void {
258 |   mode = 'menu';
259 |   game = null;
260 |   anim = null;
261 |   renderer.clearEffects();
262 |   showOverlay('menu');
263 |   applyUpdateIfIdle();
264 | }
265 | 
```

`goMenu()` … メニューに戻る。ゲームを捨てて、エフェクトも消す。
新しい版が届いていれば、ここで切り替える（下の「オフライン対応」の `applyUpdateIfIdle`）。


## 毎フレーム: 演出のきっかけ processAnimation

**L266–279**

```ts
266 | // ---------- 1フレームごとの処理 ----------
267 | function processAnimation(now: number): void {
268 |   if (!anim || !game) return;
269 |   const e = now - anim.start;
270 |   const steps = anim.turn.chain.steps;
271 |   const tl = anim.turn.timeline;
272 |   while (firedPops < steps.length && e >= tl.steps[firedPops].popStart) {
273 |     const step = steps[firedPops];
274 |     renderer.onPop(step, now);
275 |     sound.pop(step.chain);
276 |     revealedScore += step.score;
277 |     revealedMaxChain = Math.max(revealedMaxChain, step.chain);
278 |     firedPops++;
279 |   }
```

アニメーションの経過時間を見て、「1連鎖が消える瞬間」を過ぎていたら、その瞬間の処理を1回だけ行う。
- L272: まだ処理していない連鎖のうち、消え始めの時刻を過ぎたものを順に処理する。1フレームの間に2つ過ぎていても取りこぼさないよう `while` にしている。
- L274–278: 破片などのエフェクト、キィン音、スコアの加算（表示用）、最大連鎖の更新、処理済みの数を1つ進める。

**L280–289**

```ts
280 |   if (e >= tl.total) {
281 |     if (anim.turn.chain.allClear) {
282 |       renderer.banner('ALL CLEAR', now);
283 |       sound.allClear();
284 |     }
285 |     revealedScore = game.score;
286 |     anim = null;
287 |   }
288 | }
289 | 
```

演出が全部終わったら:
- 全消しなら「ALL CLEAR」の表示と音。
- 表示用スコアを本当の値に合わせて（念のため）、アニメーションを終える。

## 毎フレーム: 終了の処理 processEnd

**L290–306**

```ts
290 | function processEnd(now: number): void {
291 |   if (!game || endAt === null || endHandled || now < endAt) return;
292 |   endHandled = true;
293 |   const elapsed = endAt - startAt + penaltyMs;
294 |   if (game.finished === 'cleared') {
295 |     sound.clear();
296 |     renderer.banner('CLEAR!', now, 1100);
297 |     const rec: RunRecord = {
298 |       timeMs: Math.round(elapsed),
299 |       seed: game.seed,
300 |       maxChain: game.maxChain,
301 |       moves: game.moves,
302 |       undos: game.undos,
303 |       date: new Date().toISOString(),
304 |       controlScheme: options.controlScheme,
305 |     };
306 |     const res = submitRecord(target, rec);
```

終了時刻を過ぎたら一度だけ実行する。
- L291: ゲームがない、終わる予定がない、処理済み、まだ時刻前、のどれかなら何もしない。
- L293: **最終タイム** ＝ 終了時刻 − 開始時刻 ＋ ペナルティ。
- L295–296: クリアの音と「CLEAR!」表示。
- L297–306: ランキングに登録する記録を作って保存。

**L307–322**

```ts
307 |     const g = game;
308 |     window.setTimeout(() => {
309 |       if (game !== g || !g.finished) return;
310 |       showResult('cleared', elapsed, res.rank, res.prevBest?.timeMs, res.prevSeedBest?.timeMs);
311 |     }, 750);
312 |   } else {
313 |     sound.dead();
314 |     renderer.banner('窒息…', now, 1100);
315 |     const g = game;
316 |     window.setTimeout(() => {
317 |       if (game !== g || !g.finished) return;
318 |       showResult('dead', elapsed, null);
319 |     }, 750);
320 |   }
321 | }
322 | 
```

- L307–311: 0.75秒後に結果画面を出す（「CLEAR!」の演出を見せるため）。`setTimeout(関数, ミリ秒)` で、指定時間後に関数を呼ぶ。
  - L309: その0.75秒の間にリトライなどで別のゲームになっていたり、1手戻して終了状態が解除されていたりしたら、結果画面は出さない。`g` に今のゲームを控えておき、比べている。
- L312–320: 窒息した場合。記録は残さず、結果画面だけ出す。

## 毎フレーム: 画面上部の表示 updateHud

**L323–333**

```ts
323 | function updateHud(now: number, dt: number): void {
324 |   const elapsed = mode === 'menu' ? 0 : (endAt !== null && now >= endAt ? endAt : now) - startAt + penaltyMs;
325 |   ui.time.textContent = formatTime(game ? elapsed : 0);
326 |   const real = revealedScore;
327 |   shownScore += (real - shownScore) * Math.min(1, dt / 70);
328 |   if (Math.abs(real - shownScore) < 1) shownScore = real;
329 |   ui.score.textContent = fmt(Math.round(shownScore));
330 |   ui.bar.style.width = `${Math.min(100, (shownScore / target) * 100)}%`;
331 |   ui.maxchain.textContent = `${revealedMaxChain}連鎖`;
332 |   ui.moves.textContent = String(game?.moves ?? 0);
333 | 
```

- L324: 表示するタイム。終了時刻を過ぎていれば終了時刻で止め、そうでなければ現在時刻まで。どちらもペナルティを足す。
- L327: 表示スコアを、本当の値との差の一部ずつ近づける（カウントアップ演出）。`dt / 70` で、フレームの間隔に関係なく約70msで追いつく。
- L328: 差が1未満になったらぴったり合わせる。
- L330: 目標点に対する進み具合のバーの長さ（最大100%）。

**L334–347**

```ts
334 |   // 1手戻すボタン（ネクスト列の下に置く）
335 |   const inPlay = mode === 'playing' && !!game;
336 |   ui.undo.hidden = !inPlay;
337 |   if (inPlay) {
338 |     ui.undo.disabled = !canUndo();
339 |     const slot = renderer.sideSlot();
340 |     const h = ui.undo.offsetHeight;
341 |     ui.undo.style.left = `${slot.left}px`;
342 |     ui.undo.style.top = `${slot.bottom - h}px`;
343 |     ui.undo.style.width = `${slot.width}px`;
344 |   }
345 |   ui.resultUndo.hidden = !(mode === 'result' && game?.finished === 'dead' && game.canUndo());
346 | }
347 | 
```

「1手戻す」ボタンの表示。
- L335–336: プレイ中だけ表示。
- L338: 戻せないとき（演出中など）は押せない状態に。
- L339–343: canvas の上に重ねたボタンを、ネクスト列の下端に合わせて置く。canvas の大きさは画面によって変わるので、毎フレーム renderer に位置を聞いて合わせている。
- L345: 結果画面の「1手戻して続ける」ボタンは、窒息して戻せるときだけ表示。

## メインループ frame

**L348–371**

```ts
348 | let last = performance.now();
349 | function frame(now: number): void {
350 |   const dt = Math.min(50, now - last);
351 |   last = now;
352 |   keyboard.update(now);
353 |   processAnimation(now);
354 |   processEnd(now);
355 |   updateHud(now, dt);
356 |   renderer.render(
357 |     {
358 |       field: game ? game.field : emptyField,
359 |       anim,
360 |       current: game && !game.finished ? game.current() : null,
361 |       cursor,
362 |       nexts: game ? game.nexts() : [],
363 |       ghost: !!game && !game.finished,
364 |       cancelHint,
365 |     },
366 |     now,
367 |     dt,
368 |   );
369 |   requestAnimationFrame(frame);
370 | }
371 | 
```

1フレームごとに呼ばれる関数。
- L350: 前のフレームからの経過時間。タブを裏に回していた後などに大きな値になると破片が吹っ飛ぶので、最大50msに抑える。
- L352–355: 長押しの移動 → 演出のきっかけ → 終了の処理 → 上部の表示、の順に更新。
- L356–368: 描画担当に「今描くもの」を渡して描いてもらう。メニュー中は飾りの盤面 `emptyField` を描く。
- L369: `requestAnimationFrame(frame)` … 「次に画面を描き替えるタイミングで、もう一度 frame を呼んで」とブラウザに頼む。これで画面のリフレッシュレート（多くは60回/秒）に合わせてループし続ける。

**L372–387**

```ts
372 | // メニュー中に盤面に飾りとして並べる宝石
373 | const emptyField = Field.fromRows([
374 |   '......',
375 |   '......',
376 |   '......',
377 |   '......',
378 |   '......',
379 |   '......',
380 |   '......',
381 |   '3.....',
382 |   '20...1',
383 |   '201.31',
384 |   '120331',
385 |   '112002',
386 | ]);
387 | 
```

メニュー画面の背景に置く飾りの盤面。`Field.fromRows` に画面の見た目どおりの文字列で書いている。
`const` は宣言より前で使うとエラーになるが、`frame()` が実際に呼ばれるのはファイルの最後（L595）より後なので問題ない。

## 画面の切り替え showOverlay

**L388–397**

```ts
388 | // ---------- オーバーレイ ----------
389 | type OverlayName = 'menu' | 'options' | 'ranking' | 'result';
390 | function showOverlay(name: OverlayName | null): void {
391 |   ui.menu.hidden = name !== 'menu';
392 |   ui.options.hidden = name !== 'options';
393 |   ui.ranking.hidden = name !== 'ranking';
394 |   ui.result.hidden = name !== 'result';
395 |   if (name === 'menu') $('start').focus();
396 | }
397 | 
```

メニュー・オプション・ランキング・結果のうち、指定したものだけを表示し、残りを隠す。`null` なら全部隠す（プレイ画面だけになる）。
HTML 要素の `hidden` を true にすると非表示になる。メニューを開いたときは、Enter ですぐ始められるようスタートボタンにフォーカスを当てる。

## 結果画面 showResult

**L398–406**

```ts
398 | function showResult(kind: 'cleared' | 'dead', elapsed: number, rank: number | null, prevBest?: number, prevSeedBest?: number): void {
399 |   if (!game) return;
400 |   mode = 'result';
401 |   const kindEl = $('result-kind');
402 |   kindEl.textContent = kind === 'cleared' ? (rank === 1 ? 'NEW RECORD' : 'CLEAR') : '窒息';
403 |   kindEl.classList.toggle('dead', kind === 'dead');
404 |   $('result-time').textContent = formatTime(elapsed);
405 |   const delta = $('result-delta');
406 |   delta.className = 'result-delta';
```

- 引数: 種類（クリア／窒息）、タイム、順位、これまでのベスト、このシードでのベスト。最後の2つは `?` 付きで省略可能。
- L402: 見出し。1位なら「NEW RECORD」。
- L403: `classList.toggle('dead', 条件)` … 条件が真ならクラスを付け、偽なら外す。窒息なら赤い見出しにする。
- L406: 差分表示のクラスをいったんリセット。

**L407–426**

```ts
407 |   if (kind === 'cleared') {
408 |     const parts: string[] = [];
409 |     if (prevBest !== undefined) {
410 |       const d = elapsed - prevBest;
411 |       parts.push(`ベスト ${d <= 0 ? '−' : '+'}${formatTime(Math.abs(d))}`);
412 |       delta.classList.add(d <= 0 ? 'better' : 'worse');
413 |     } else {
414 |       parts.push('初記録');
415 |       delta.classList.add('better');
416 |     }
417 |     if (prevSeedBest !== undefined) {
418 |       const d = elapsed - prevSeedBest;
419 |       parts.push(`このシード ${d <= 0 ? '−' : '+'}${formatTime(Math.abs(d))}`);
420 |     }
421 |     if (rank) parts.push(`${rank}位`);
422 |     delta.textContent = parts.join('　');
423 |   } else {
424 |     delta.textContent = game.canUndo() ? `1手戻すと +${CONFIG.UNDO_PENALTY_MS / 1000}秒で続行できます` : '記録なし';
425 |     delta.classList.add('worse');
426 |   }
```

- クリアの場合: ベストとの差を「ベスト −0:01.23」の形で作る。速ければ（差が0以下）緑、遅ければ赤。初めての記録なら「初記録」。シード別ベストとの差、順位も並べて、全角スペースでつなぐ。
- 窒息の場合: 1手戻せるなら「1手戻すと +5秒で続行できます」と案内する。

**L427–436**

```ts
427 |   $('result-target').textContent = fmt(target);
428 |   $('result-score').textContent = fmt(game.score);
429 |   $('result-seed').textContent = String(game.seed);
430 |   $('result-chain').textContent = `${game.maxChain}連鎖`;
431 |   $('result-moves').textContent = String(game.moves);
432 |   $('result-undos').textContent = String(game.undos);
433 |   showOverlay('result');
434 |   $('retry').focus();
435 | }
436 | 
```

目標点・スコア・シード・最大連鎖・手数・戻した回数を表示して、結果画面を開く。Enter ですぐリトライできるようリトライボタンにフォーカス。

## メニューの組み立て

**L437–454**

```ts
437 | // ---------- メニューの組み立て ----------
438 | function renderTargets(): void {
439 |   ui.targets.replaceChildren(
440 |     ...CONFIG.TARGETS.map((t) => {
441 |       const b = document.createElement('button');
442 |       b.type = 'button';
443 |       b.className = 'seg-btn';
444 |       b.textContent = targetLabel(t);
445 |       b.setAttribute('aria-pressed', String(t === target));
446 |       b.addEventListener('click', () => {
447 |         target = t;
448 |         renderTargets();
449 |       });
450 |       return b;
451 |     }),
452 |   );
453 | }
454 | 
```

`renderTargets()` … 目標点のボタンを作り直す。
- `replaceChildren(...)` … 中身を丸ごと入れ替える。`...配列` で配列の要素を引数として並べて渡す。
- 各目標点についてボタンを作り（`document.createElement('button')`）、選ばれているものには `aria-pressed="true"` を付ける。CSS はこの属性を見て金色の「選択中」の見た目にする。`aria-pressed` は読み上げソフトにも「押されている」と伝わる。
- クリックされたら、その目標点を選んで作り直す。

**L455–462**

```ts
455 | function setSeedMode(m: 'random' | 'fixed'): void {
456 |   seedMode = m;
457 |   ui.seedRandom.setAttribute('aria-pressed', String(m === 'random'));
458 |   ui.seedFixed.setAttribute('aria-pressed', String(m === 'fixed'));
459 |   ui.seedInput.disabled = m === 'random';
460 |   if (m === 'fixed') ui.seedInput.focus();
461 | }
462 | 
```

`setSeedMode(m)` … シードの選び方を切り替える。ランダムなら番号の入力欄を無効にし、番号指定なら入力欄にカーソルを移す。

**L463–477**

```ts
463 | function renderHowto(): void {
464 |   const arrow =
465 |     '<b>キーボード</b>　<kbd>←</kbd><kbd>→</kbd> 移動　<kbd>Z</kbd><kbd>X</kbd> 回転　<kbd>↓</kbd>/<kbd>↑</kbd> 設置';
466 |   const direct =
467 |     '<b>キーボード</b>　<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> 子ぷよの向き　<kbd>H</kbd><kbd>J</kbd><kbd>K</kbd><kbd>L</kbd><kbd>;</kbd><kbd>\'</kbd> その列に設置';
468 |   const touch =
469 |     options.touchScheme === 'twohand'
470 |       ? '<b>タッチ（両手）</b>　左半分を横にスワイプで列、右半分をフリックで子ぷよの向き。右を先に離すと設置、左を先に離すと取り消し'
471 |       : '<b>タッチ</b>　列をタップで縦置き、フリックで子ぷよの向き。盤面の外まで引っぱるか2本目の指でタップすると取り消し（マウスは右クリック）';
472 |   const common = `${touch}<br><kbd>Q</kbd> 1手戻す(+5秒)　<kbd>R</kbd> リトライ　<kbd>N</kbd> 新しいシード　<kbd>Esc</kbd> メニュー`;
473 |   const key = options.controlScheme === 'arrow' ? arrow : direct;
474 |   ui.howto.innerHTML = `${key}<br>${common}`;
475 |   ui.keyhelp.innerHTML = `${key.replace('<b>キーボード</b>　', '')}<br><kbd>Q</kbd>/<kbd>BS</kbd> 1手戻す(+5秒)<br><kbd>R</kbd> リトライ　<kbd>N</kbd> 新シード<br><kbd>Esc</kbd> メニュー`;
476 | }
477 | 
```

`renderHowto()` … 遊び方の説明文を、今の操作方式に合わせて作る。メニュー画面用（`howto`）と、PCのプレイ画面右側用（`keyhelp`）の2か所。`<kbd>` はキーボードのキーを表す HTML の要素で、CSS でキーっぽい見た目にしている。
タッチの説明も、片手モードと両手モードで出し分ける。


## オプションの反映 applyOptions

**L478–511**

```ts
478 | function applyOptions(): void {
479 |   keyboard.scheme = options.controlScheme;
480 |   pointer.threshold = options.flickThreshold;
481 |   pointer.enabled = options.touchScheme === 'single';
482 |   twoHand.enabled = options.touchScheme === 'twohand';
483 |   twoHand.threshold = options.flickThreshold;
484 |   twoHand.columnStep = options.columnStep;
485 |   sound.setVolume(options.sfxVolume);
486 |   for (const b of $('opt-scheme').querySelectorAll<HTMLButtonElement>('.seg-btn')) {
487 |     b.setAttribute('aria-pressed', String(b.dataset.value === options.controlScheme));
488 |   }
489 |   for (const b of $('opt-spawn-col').querySelectorAll<HTMLButtonElement>('.seg-btn')) {
490 |     b.setAttribute('aria-pressed', String(b.dataset.value === options.spawnCol));
491 |   }
492 |   for (const b of $('opt-spawn-rot').querySelectorAll<HTMLButtonElement>('.seg-btn')) {
493 |     b.setAttribute('aria-pressed', String(b.dataset.value === options.spawnRot));
494 |   }
495 |   for (const b of $('opt-touch').querySelectorAll<HTMLButtonElement>('.seg-btn')) {
496 |     b.setAttribute('aria-pressed', String(b.dataset.value === options.touchScheme));
497 |   }
498 |   const step = $<HTMLInputElement>('opt-step');
499 |   step.value = String(options.columnStep);
500 |   $('opt-step-out').textContent = `${options.columnStep}px`;
501 |   $('opt-step-group').hidden = options.touchScheme !== 'twohand';
502 |   const flick = $<HTMLInputElement>('opt-flick');
503 |   flick.value = String(options.flickThreshold);
504 |   $('opt-flick-out').textContent = `${options.flickThreshold}px`;
505 |   const vol = $<HTMLInputElement>('opt-volume');
506 |   vol.value = String(options.sfxVolume);
507 |   $('opt-volume-out').textContent = `${Math.round(options.sfxVolume * 100)}%`;
508 |   renderHowto();
509 |   saveOptions(options);
510 | }
511 | 
```

オプションが変わるたびに呼ぶ。
- L479–485: 入力・音に設定を反映。タッチは片手（`pointer`）と両手（`twoHand`）のどちらか一方だけを `enabled` にする。
- L486–497: 操作方式・次のペアの列・子ぷよの向き・タッチ操作のボタンの選択状態を更新。`querySelectorAll('.seg-btn')` でその中のボタンを全部取り、`data-value` 属性（HTML の `data-value="arrow"`。JavaScript からは `dataset.value`）と比べる。
- L498–507: スライダーの位置と、横の数値表示を更新。「1列動かす距離」のスライダーは両手モードのときだけ表示する（`hidden`）。
- L508–509: 説明文を作り直して、設定を保存。


## ランキング画面 renderRanking

**L512–528**

```ts
512 | function renderRanking(): void {
513 |   ui.rankTabs.replaceChildren(
514 |     ...CONFIG.TARGETS.map((t) => {
515 |       const b = document.createElement('button');
516 |       b.type = 'button';
517 |       b.className = 'seg-btn';
518 |       b.textContent = targetLabel(t);
519 |       b.setAttribute('aria-pressed', String(t === rankTarget));
520 |       b.addEventListener('click', () => {
521 |         rankTarget = t;
522 |         renderRanking();
523 |       });
524 |       return b;
525 |     }),
526 |   );
527 |   ui.rankNote.hidden = configSignature() === 'default';
528 |   const list = getRanking(rankTarget);
```

- L513–526: 目標点のタブを作る（目標点ボタンと同じ作り方）。
- L527: 設定定数を変えているなら「別枠の記録です」という注意を出す。
- L528: その目標点の記録を読み込む。

**L529–556**

```ts
529 |   if (list.length === 0) {
530 |     ui.rankBody.innerHTML = '<tr><td class="empty" colspan="7">まだ記録がありません。最初の1本を走ろう。</td></tr>';
531 |     return;
532 |   }
533 |   ui.rankBody.replaceChildren(
534 |     ...list.map((r, i) => {
535 |       const tr = document.createElement('tr');
536 |       if (i === 0) tr.className = 'top';
537 |       const d = new Date(r.date);
538 |       const cells = [
539 |         String(i + 1),
540 |         formatTime(r.timeMs),
541 |         String(r.seed),
542 |         `${r.maxChain}`,
543 |         String(r.moves),
544 |         String(r.undos ?? 0),
545 |         `${d.getMonth() + 1}/${d.getDate()}`,
546 |       ];
547 |       for (const c of cells) {
548 |         const td = document.createElement('td');
549 |         td.textContent = c;
550 |         tr.append(td);
551 |       }
552 |       return tr;
553 |     }),
554 |   );
555 | }
556 | 
```

- L529–532: 記録がなければ「まだ記録がありません」の行だけ出す。`innerHTML` は HTML の文字列で中身を書き換える。
- L533–554: 記録1件ごとに表の行（`tr`）を作る。1位の行には `top` クラスを付けて金色にする。
- L537: 保存していた日時の文字列から日付を作る。
- L538–546: 各列の文字。`r.undos ?? 0` は、1手戻す機能を入れる前の記録（`undos` がない）なら0と表示。`getMonth()` は0始まり（1月が0）なので1を足す。
- L547–551: セル（`td`）を作って行に追加。`textContent` で入れると、文字列が HTML として解釈されないので安全。

## ボタンなどのイベント

**L557–574**

```ts
557 | // ---------- イベント ----------
558 | ui.seedRandom.addEventListener('click', () => setSeedMode('random'));
559 | ui.seedFixed.addEventListener('click', () => setSeedMode('fixed'));
560 | $('start').addEventListener('click', () => startGame(chosenSeed()));
561 | $('open-options').addEventListener('click', () => showOverlay('options'));
562 | $('close-options').addEventListener('click', () => showOverlay('menu'));
563 | $('open-ranking').addEventListener('click', () => {
564 |   rankTarget = target;
565 |   renderRanking();
566 |   showOverlay('ranking');
567 | });
568 | $('close-ranking').addEventListener('click', () => showOverlay('menu'));
569 | $('retry').addEventListener('click', () => handlers.retry());
570 | $('new-seed').addEventListener('click', () => handlers.newSeed());
571 | $('to-menu').addEventListener('click', goMenu);
572 | ui.undo.addEventListener('click', undo);
573 | ui.resultUndo.addEventListener('click', undo);
574 | 
```

各ボタンが押されたときの処理を登録する。`addEventListener('click', 関数)`。

**L575–592**

```ts
575 | for (const b of $('opt-scheme').querySelectorAll<HTMLButtonElement>('.seg-btn')) {
576 |   b.addEventListener('click', () => {
577 |     options = { ...options, controlScheme: b.dataset.value as Options['controlScheme'] };
578 |     applyOptions();
579 |   });
580 | }
581 | for (const b of $('opt-spawn-col').querySelectorAll<HTMLButtonElement>('.seg-btn')) {
582 |   b.addEventListener('click', () => {
583 |     options = { ...options, spawnCol: b.dataset.value as Options['spawnCol'] };
584 |     applyOptions();
585 |   });
586 | }
587 | for (const b of $('opt-spawn-rot').querySelectorAll<HTMLButtonElement>('.seg-btn')) {
588 |   b.addEventListener('click', () => {
589 |     options = { ...options, spawnRot: b.dataset.value as Options['spawnRot'] };
590 |     applyOptions();
591 |   });
592 | }
```

オプションの操作方式・次のペアの列・子ぷよの向きのボタン。押されたら、そのボタンの値で設定を更新して反映する。


**L593–602**

```ts
593 | for (const b of $('opt-touch').querySelectorAll<HTMLButtonElement>('.seg-btn')) {
594 |   b.addEventListener('click', () => {
595 |     options = { ...options, touchScheme: b.dataset.value as Options['touchScheme'] };
596 |     applyOptions();
597 |   });
598 | }
599 | $<HTMLInputElement>('opt-step').addEventListener('input', (e) => {
600 |   options = { ...options, columnStep: Number((e.target as HTMLInputElement).value) };
601 |   applyOptions();
602 | });
```

タッチ操作（片手／両手）のボタンと、両手モードで1列動かす距離のスライダー。作り方は上と同じ。

**L603–612**

```ts
603 | $<HTMLInputElement>('opt-flick').addEventListener('input', (e) => {
604 |   options = { ...options, flickThreshold: Number((e.target as HTMLInputElement).value) };
605 |   applyOptions();
606 | });
607 | $<HTMLInputElement>('opt-volume').addEventListener('input', (e) => {
608 |   options = { ...options, sfxVolume: Number((e.target as HTMLInputElement).value) };
609 |   applyOptions();
610 |   sound.unlock();
611 |   sound.pop(3);
612 | });
```

スライダー。`input` イベントは、つまみを動かしている最中にも何度も届く。
音量スライダーは、動かすたびにキィン音を鳴らして音量を確かめられるようにしている。

## 記録の全削除（2回押し）

**L613–628**

```ts
613 | const clearBtn = $<HTMLButtonElement>('clear-records');
614 | clearBtn.addEventListener('click', () => {
615 |   if (clearBtn.dataset.armed === 'true') {
616 |     clearRecords();
617 |     clearBtn.dataset.armed = 'false';
618 |     clearBtn.textContent = '削除しました';
619 |     return;
620 |   }
621 |   clearBtn.dataset.armed = 'true';
622 |   clearBtn.textContent = 'もう一度押すと削除';
623 |   window.setTimeout(() => {
624 |     clearBtn.dataset.armed = 'false';
625 |     clearBtn.textContent = '記録をすべて削除';
626 |   }, 3000);
627 | });
628 | 
```

うっかり消さないよう、1回目は「もう一度押すと削除」に変わるだけ。3秒以内にもう一度押すと削除する。
`dataset.armed` は HTML の `data-armed` 属性。押せる状態かどうかを要素自体に覚えさせ、CSS でも見た目を変えている。

**L629–630**

```ts
629 | new ResizeObserver(() => renderer.resize()).observe($('stage'));
630 | 
```

`ResizeObserver` … 指定した要素の大きさが変わったら知らせてくれる仕組み。盤面のエリアの大きさが変わるたびにレイアウトを計算し直す。

## オフライン対応（PWA）

一度ページを開くと、ブラウザが **Service Worker**（ページとは別に裏で動く小さなプログラム）を登録し、ゲームに必要なファイルを端末に保存する。次からはネットにつながっていなくても、保存したファイルで遊べる。Service Worker 本体（`sw.js`）はビルドの道具（vite-plugin-pwa）が自動で作る。設定は `vite.config.ts`。

**L631–644**

```ts
631 | // ---------- オフライン対応（PWA） ----------
632 | // 新しい版が届いても、遊んでいる途中では切り替えない。メニュー画面に戻ったときに再読み込みして切り替える
633 | let updateReady = false;
634 | const updateSW = registerSW({
635 |   onNeedRefresh() {
636 |     updateReady = true;
637 |     applyUpdateIfIdle();
638 |   },
639 | });
640 | 
641 | function applyUpdateIfIdle(): void {
642 |   if (updateReady && mode === 'menu') void updateSW(true);
643 | }
644 | 
```

- L634–639: `registerSW` で Service Worker を登録する。新しい版（ゲームを更新して公開し直したもの）が見つかると `onNeedRefresh` が呼ばれる。
- L633, L636: 新しい版が届いたことを覚えておく。
- L641–643: `applyUpdateIfIdle()` … メニュー画面にいるときだけ、新しい版に切り替える。`updateSW(true)` は新しい Service Worker を有効にしてページを再読み込みする。遊んでいる途中に再読み込みされるとタイムも盤面も消えてしまうので、プレイ中は待って、メニューに戻ったとき（`goMenu`）に切り替える。
- `void` … 「戻り値（Promise）は待たない」ことをはっきり書くための印。

## 起動

**L645–649**

```ts
645 | // ---------- 起動 ----------
646 | renderTargets();
647 | applyOptions();
648 | showOverlay('menu');
649 | requestAnimationFrame(frame);
```

ページを開いたときに1回だけ実行される部分。目標点のボタンを作り、オプションを反映し、メニューを開き、メインループを始める。
