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

**L1–18**

```ts
  1 | import './style.css';
  2 | import { CONFIG, configSignature } from './config';
  3 | import { sound } from './audio/sound';
  4 | import { Field, clampPlacement, type Rotation } from './core/field';
  5 | import { Game } from './core/game';
  6 | import { randomSeed } from './core/tsumo';
  7 | import { Keyboard, Pointer, TwoHand, type ControlHandlers } from './input/controls';
  8 | import { Renderer, type Cursor, type TurnAnimation } from './render/renderer';
  9 | import {
 10 |   clearRecords,
 11 |   getRanking,
 12 |   loadOptions,
 13 |   saveOptions,
 14 |   submitRecord,
 15 |   type Options,
 16 |   type RunRecord,
 17 | } from './storage';
 18 | 
```

- L1: CSS を読み込む。Vite がこれを見てページにスタイルを適用する（`vite-env.d.ts` の宣言で TypeScript にも CSS の import を許可している）。
- L2–17: 各ファイルから必要なものを読み込む。`import { ... } from` を複数行に分けて書くこともできる。


## 画面の部品を取ってくる

**L19–21**

```ts
 19 | // ---------- DOM ----------
 20 | const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
 21 | const canvas = $<HTMLCanvasElement>('board');
```

- L20: `$` という短い名前の関数を作る。`document.getElementById(id)` で HTML の部品を id で探す。
  - `<T extends HTMLElement = HTMLElement>` はジェネリクス。`$<HTMLButtonElement>('undo')` のように書くと「ボタンとして」取り出せて、ボタン専用の機能（`disabled` など）が使える。何も書かなければ普通の HTML 要素。
  - `as T` は「この型だと思って扱ってよい」という指定。
- L21: 盤面を描く canvas。

**L22–47**

```ts
 22 | const ui = {
 23 |   time: $('time'),
 24 |   score: $('score'),
 25 |   target: $('target'),
 26 |   bar: $('bar'),
 27 |   seed: $('seed'),
 28 |   maxchain: $('maxchain'),
 29 |   moves: $('moves'),
 30 |   keyhelp: $('keyhelp'),
 31 |   penalty: $('penalty'),
 32 |   undo: $<HTMLButtonElement>('undo'),
 33 |   resultUndo: $<HTMLButtonElement>('result-undo'),
 34 |   menu: $('menu'),
 35 |   options: $('options'),
 36 |   ranking: $('ranking'),
 37 |   result: $('result'),
 38 |   targets: $('targets'),
 39 |   seedRandom: $<HTMLButtonElement>('seed-random'),
 40 |   seedFixed: $<HTMLButtonElement>('seed-fixed'),
 41 |   seedInput: $<HTMLInputElement>('seed-input'),
 42 |   howto: $('howto'),
 43 |   rankTabs: $('rank-tabs'),
 44 |   rankBody: $('rank-body'),
 45 |   rankNote: $('rank-note'),
 46 | };
 47 | 
```

よく使う画面の部品をまとめて取り出し、`ui.time` のような名前で使えるようにしておく。毎回 `getElementById` するより速く、書くのも楽。

## 表示用の小さな関数

**L48–55**

```ts
 48 | // ---------- 表示用ユーティリティ ----------
 49 | export function formatTime(ms: number): string {
 50 |   const cs = Math.floor(Math.max(0, ms) / 10);
 51 |   const m = Math.floor(cs / 6000);
 52 |   const s = Math.floor((cs % 6000) / 100);
 53 |   const c = cs % 100;
 54 |   return `${m}:${String(s).padStart(2, '0')}.${String(c).padStart(2, '0')}`;
 55 | }
```

`formatTime(ms)` … ミリ秒を `1:23.45` の形にする。
- L50: 1/100秒単位（センチ秒）に直す。`Math.max(0, ms)` で負にならないようにする。
- L51: 分 = 6000センチ秒ごとに1。
- L52: 秒 = 分を除いた残りを100で割る。
- L53: 1/100秒の部分。
- L54: `padStart(2, '0')` で、1桁なら頭に0をつけて2桁にする（`5` → `05`）。

**L56–58**

```ts
 56 | const fmt = (n: number) => n.toLocaleString('en-US');
 57 | const targetLabel = (t: number) => (t >= 10_000 ? `${t / 10_000}万` : fmt(t));
 58 | 
```

- `fmt(n)` … 3桁ごとにカンマ（`100000` → `100,000`）。
- `targetLabel(t)` … 目標点を「10万」「1000万」のような日本語表記にする。

## アプリの状態

**L59–61**

```ts
 59 | // ---------- 状態 ----------
 60 | type Mode = 'menu' | 'playing' | 'result';
 61 | 
```

`Mode` … 今どの画面か。`'menu'`（メニュー）、`'playing'`（プレイ中）、`'result'`（結果画面）。

**L62–82**

```ts
 62 | let options: Options = loadOptions();
 63 | let mode: Mode = 'menu';
 64 | let target = CONFIG.TARGETS[0];
 65 | let seedMode: 'random' | 'fixed' = 'random';
 66 | let game: Game | null = null;
 67 | let cursor: Cursor = { x: 2, rot: 0 };
 68 | let anim: TurnAnimation | null = null;
 69 | let firedPops = 0;
 70 | let startAt = 0;
 71 | let busyUntil = 0;
 72 | let endAt: number | null = null;
 73 | let endHandled = false;
 74 | let shownScore = 0;
 75 | let revealedScore = 0;
 76 | let revealedMaxChain = 0;
 77 | /** 1手戻したぶんの合計ペナルティ */
 78 | let penaltyMs = 0;
 79 | /** タッチ/マウスで「離すとキャンセル」の位置にいる */
 80 | let cancelHint = false;
 81 | let rankTarget = target;
 82 | 
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

**L83–84**

```ts
 83 | const renderer = new Renderer(canvas);
 84 | 
```

描画担当を作る。

## ゲーム操作

**L85–89**

```ts
 85 | // ---------- ゲーム操作 ----------
 86 | function canControl(): boolean {
 87 |   return mode === 'playing' && !!game && !game.finished && performance.now() >= busyUntil;
 88 | }
 89 | 
```

`canControl()` … 操作を受け付けてよいか。プレイ中で、ゲームがあって、終わっていなくて、演出が終わっている。`!!game` は「game が null でなければ true」にする書き方。

## ゲーム開始 startGame

**L90–113**

```ts
 90 | function startGame(seed: number): void {
 91 |   sound.unlock();
 92 |   game = new Game(seed, target);
 93 |   cursor = { x: 2, rot: 0 };
 94 |   anim = null;
 95 |   firedPops = 0;
 96 |   busyUntil = 0;
 97 |   endAt = null;
 98 |   endHandled = false;
 99 |   shownScore = 0;
100 |   revealedScore = 0;
101 |   revealedMaxChain = 0;
102 |   penaltyMs = 0;
103 |   cancelHint = false;
104 |   ui.penalty.hidden = true;
105 |   ui.score.style.minWidth = `${fmt(target).length}ch`;
106 |   renderer.clearEffects();
107 |   mode = 'playing';
108 |   showOverlay(null);
109 |   ui.seed.textContent = String(seed);
110 |   ui.target.textContent = fmt(target);
111 |   startAt = performance.now();
112 | }
113 | 
```

- L91: 音を使えるようにする（ボタンやキーを押した直後なのでブラウザが許可してくれる）。
- L92: 新しいゲームを作る。
- L93–104: 状態をすべて初期化。
- L105: スコアの表示幅を、目標点の桁数ぶん確保する（`ch` は数字1文字ぶんの幅）。点数が増えて桁が増えても横にずれないようにするため。
- L106–110: エフェクトを消し、プレイ中にして、画面の上に重なっている画面を全部閉じ、シードと目標点を表示。
- L111: 最後に開始時刻を記録。準備の処理時間がタイムに入らないよう、一番最後に取る。

**L114–120**

```ts
114 | function canUndo(): boolean {
115 |   if (!game || !game.canUndo() || performance.now() < busyUntil) return false;
116 |   if (mode === 'playing') return true;
117 |   // 窒息した直後（結果画面）からも戻せる
118 |   return mode === 'result' && game.finished === 'dead';
119 | }
120 | 
```

`canUndo()` … 今1手戻せるか。演出中は不可。プレイ中なら可、結果画面なら窒息したときだけ可。

## 1手戻す undo

**L121–147**

```ts
121 | function undo(): void {
122 |   if (!game || !canUndo()) return;
123 |   const now = performance.now();
124 |   const prev = game.undo();
125 |   if (!prev) return;
126 |   penaltyMs += CONFIG.UNDO_PENALTY_MS;
127 |   cursor = { x: clampPlacement(prev.x, prev.rot), rot: prev.rot };
128 |   anim = null;
129 |   endAt = null;
130 |   endHandled = false;
131 |   revealedScore = game.score;
132 |   shownScore = game.score;
133 |   revealedMaxChain = game.maxChain;
134 |   renderer.clearEffects();
135 |   renderer.banner(`+${CONFIG.UNDO_PENALTY_MS / 1000}秒`, now, 600);
136 |   ui.penalty.hidden = false;
137 |   ui.penalty.textContent = `ペナルティ +${formatTime(penaltyMs)}`;
138 |   ui.penalty.classList.remove('flash');
139 |   void ui.penalty.offsetWidth;
140 |   ui.penalty.classList.add('flash');
141 |   sound.undo();
142 |   if (mode === 'result') {
143 |     mode = 'playing';
144 |     showOverlay(null);
145 |   }
146 | }
147 | 
```

- L124: ゲームに1手戻してもらう。置いていた位置と向きが返ってくる。
- L126: ペナルティを加算。タイム表示は「経過時間 + penaltyMs」なので、これで +5秒になる。
- L127: カーソルを取り消した手の位置へ。置き直しやすくするため。
- L128–133: アニメーションと終了状態を解除し、表示用のスコアなどをゲームの値に合わせる。
- L134–135: エフェクトを消して、中央に「+5秒」を出す。
- L136–140: ペナルティ表示を更新し、点滅アニメーションをかけ直す。CSS アニメーションは同じクラスを付け直しても再生されないので、一度外し、`offsetWidth` を読んでブラウザに「外した状態」を確定させてから（**リフロー**を起こす小技）付け直している。
- L142–145: 結果画面（窒息）から戻した場合は、プレイ中に戻して結果画面を閉じる。

**L148–155**

```ts
148 | function chosenSeed(): number {
149 |   if (seedMode === 'fixed') {
150 |     const v = Math.floor(Number(ui.seedInput.value));
151 |     if (v >= 1 && v <= CONFIG.SEED_COUNT) return v;
152 |   }
153 |   return randomSeed();
154 | }
155 | 
```

`chosenSeed()` … メニューの設定からシードを決める。番号指定で、入力が 1〜65536 の範囲ならその番号。それ以外（ランダム、または入力が空・範囲外）はランダム。

## 1手置く placeAt

**L156–161**

```ts
156 | function placeAt(x: number, rot: Rotation): void {
157 |   if (!game || !canControl()) return;
158 |   const now = performance.now();
159 |   const before: Field = game.field.clone();
160 |   const turn = game.place(x, rot);
161 | 
```

- L157: 操作できなければ何もしない。
- L159: 置く前の盤面を複製しておく（アニメーションで使う）。
- L160: ゲームに置いてもらう。この1行で連鎖の計算まで全部終わる。

**L162–170**

```ts
162 |   // アニメーション用に各段階の盤面を作る
163 |   const f = before.clone();
164 |   f.place(turn.pair, x, rot);
165 |   const frames = [f.clone()];
166 |   for (const step of turn.chain.steps) {
167 |     f.removeAndFall(step.cleared);
168 |     frames.push(f.clone());
169 |   }
170 |   anim = { turn, before, frames, start: now };
```

アニメーション用に、各段階の盤面を作り直す。
- 置く前の盤面の複製に同じように置き（`frames[0]`）、各連鎖の消去を順に再現して、そのたびに複製を記録する。
- ゲーム本体は最後の盤面しか持っていないので、途中の盤面はこうして作る。
- L170: アニメーションの情報をまとめる。

**L171–180**

```ts
171 |   firedPops = 0;
172 |   busyUntil = now + turn.timeline.total;
173 |   if (turn.cleared || turn.dead) endAt = busyUntil;
174 |   sound.place();
175 | 
176 |   const nextRot = options.spawnRot === 'keep' ? rot : 0;
177 |   const nextX = options.spawnCol === 'keep' ? x : 2;
178 |   cursor = { x: clampPlacement(nextX, nextRot), rot: nextRot };
179 | }
180 | 
```

- L172: 演出が終わる時刻まで操作を止める。
- L173: この手でクリアか窒息したなら、終了時刻は演出が終わる瞬間。**タイムは最後の連鎖が終わった瞬間で確定**、という仕様はここで決まる。
- L176–178: 次のペアの開始位置。向きと列はオプションで別々に決める。向きは「上に戻す」なら 0、「引き継ぐ」なら今置いた向き。列は「戻す」なら3列目（`2`）、「引き継ぐ」なら今置いた列。最後に `clampPlacement` で、横向きのときに盤面からはみ出さない列に直す。


## 入力に渡す操作の一覧 handlers

**L181–194**

```ts
181 | const handlers: ControlHandlers = {
182 |   canControl,
183 |   move(dx) {
184 |     const min = cursor.rot === 3 ? 1 : 0;
185 |     const max = cursor.rot === 1 ? 4 : 5;
186 |     const nx = cursor.x + dx;
187 |     if (nx < min || nx > max) return false;
188 |     cursor = { ...cursor, x: nx };
189 |     sound.move();
190 |     return true;
191 |   },
192 |   moveToWall(dx) {
193 |     while (handlers.move(dx));
194 |   },
```

`controls.ts` の `ControlHandlers` の形どおりに、実際の処理を書いたオブジェクト。`canControl,` は `canControl: canControl` の省略形。
- `move(dx)` … カーソルを左右に動かす。向きによって動ける範囲が違う（子が左なら1列目より左には行けない、子が右なら5列目まで）。動けたら移動音を鳴らして true。
- `moveToWall(dx)` … 動けなくなるまで `move` をくり返す。`while (条件);` は中身のない while で、条件の関数を呼ぶこと自体が処理になっている。

**L195–209**

```ts
195 |   rotate(dir) {
196 |     const rot = ((cursor.rot + dir + 4) % 4) as Rotation;
197 |     cursor = { x: clampPlacement(cursor.x, rot), rot };
198 |     sound.rotate();
199 |   },
200 |   setRotation(rot) {
201 |     cursor = { x: clampPlacement(cursor.x, rot), rot };
202 |   },
203 |   place() {
204 |     placeAt(cursor.x, cursor.rot);
205 |   },
206 |   placeAt(col) {
207 |     cursor = { ...cursor, x: col };
208 |     placeAt(col, cursor.rot);
209 |   },
```

- `rotate(dir)` … 向きを回す。`+ 4` してから `% 4` するのは、左回転で -1 になったときに `3` に戻すため（`-1 % 4` は JavaScript では `-1` になってしまう）。回した後に壁からはみ出すなら `clampPlacement` で内側にずらす（壁蹴り）。
- `setRotation(rot)` … 向きを直接指定（直接指定方式）。
- `place()` … 今のカーソル位置に置く。
- `placeAt(col)` … 指定した列に置く（直接指定方式の HJKL;'）。

**L210–224**

```ts
210 |   preview(col, rot, outside) {
211 |     cursor = { x: col, rot };
212 |     cancelHint = outside;
213 |   },
214 |   cancelled() {
215 |     cancelHint = false;
216 |     sound.cancel();
217 |   },
218 |   pointerPlace(col, rot) {
219 |     placeAt(col, rot);
220 |   },
221 |   cursor() {
222 |     return { col: cursor.x, rot: cursor.rot };
223 |   },
224 |   undo,
```

- `preview` … タッチ中、カーソルを指の位置と向きに合わせ、キャンセル表示のオンオフを覚える。
- `cancelled` … キャンセル音を鳴らす。
- `pointerPlace` … タッチで置く。
- `cursor` … 今のカーソルの列と向きを返す。両手モードが、指を置いたときの起点にする。
- `undo,` … 上で定義した `undo` 関数をそのまま渡す。


**L225–246**

```ts
225 |   retry() {
226 |     if (mode === 'menu' || !game) return;
227 |     startGame(game.seed);
228 |   },
229 |   newSeed() {
230 |     if (mode === 'menu') return;
231 |     startGame(randomSeed());
232 |   },
233 |   menu() {
234 |     // オプション・ランキングはメニューから開くので、閉じてメニューに戻る
235 |     if (!ui.options.hidden || !ui.ranking.hidden) {
236 |       showOverlay('menu');
237 |       return;
238 |     }
239 |     goMenu();
240 |   },
241 |   start() {
242 |     if (mode === 'menu' && ui.options.hidden && ui.ranking.hidden) startGame(chosenSeed());
243 |     else if (mode === 'result') startGame(game ? game.seed : chosenSeed());
244 |   },
245 | };
246 | 
```

- `retry` … 同じシードで最初から。メニュー中は何もしない。
- `newSeed` … ランダムな新しいシードで最初から。
- `menu`（Esc）… オプションやランキングを開いていればメニューに戻るだけ。そうでなければ（プレイ中・結果画面）メニューへ。
- `start`（Enter / Space）… メニュー画面ならゲーム開始。結果画面なら同じシードでもう一度。

**L247–255**

```ts
247 | const keyboard = new Keyboard(handlers);
248 | const pointer = new Pointer(
249 |   canvas,
250 |   (x, y) => renderer.columnAt(x, y),
251 |   (x, y) => renderer.isOutside(x, y),
252 |   handlers,
253 | );
254 | const twoHand = new TwoHand(canvas, handlers);
255 | 
```

キーボードとタッチの入力を作る。タッチには、列を求める関数と盤面外を判定する関数を renderer から渡す（`(x, y) => renderer.columnAt(x, y)` のように包んで渡す）。
タッチは片手モード（`Pointer`）と両手モード（`TwoHand`）の両方を作っておき、オプションで選んだほうだけを有効にする（下の `applyOptions`）。


**L256–263**

```ts
256 | function goMenu(): void {
257 |   mode = 'menu';
258 |   game = null;
259 |   anim = null;
260 |   renderer.clearEffects();
261 |   showOverlay('menu');
262 | }
263 | 
```

`goMenu()` … メニューに戻る。ゲームを捨てて、エフェクトも消す。

## 毎フレーム: 演出のきっかけ processAnimation

**L264–277**

```ts
264 | // ---------- 1フレームごとの処理 ----------
265 | function processAnimation(now: number): void {
266 |   if (!anim || !game) return;
267 |   const e = now - anim.start;
268 |   const steps = anim.turn.chain.steps;
269 |   const tl = anim.turn.timeline;
270 |   while (firedPops < steps.length && e >= tl.steps[firedPops].popStart) {
271 |     const step = steps[firedPops];
272 |     renderer.onPop(step, now);
273 |     sound.pop(step.chain);
274 |     revealedScore += step.score;
275 |     revealedMaxChain = Math.max(revealedMaxChain, step.chain);
276 |     firedPops++;
277 |   }
```

アニメーションの経過時間を見て、「1連鎖が消える瞬間」を過ぎていたら、その瞬間の処理を1回だけ行う。
- L270: まだ処理していない連鎖のうち、消え始めの時刻を過ぎたものを順に処理する。1フレームの間に2つ過ぎていても取りこぼさないよう `while` にしている。
- L272–276: 破片などのエフェクト、キィン音、スコアの加算（表示用）、最大連鎖の更新、処理済みの数を1つ進める。

**L278–287**

```ts
278 |   if (e >= tl.total) {
279 |     if (anim.turn.chain.allClear) {
280 |       renderer.banner('ALL CLEAR', now);
281 |       sound.allClear();
282 |     }
283 |     revealedScore = game.score;
284 |     anim = null;
285 |   }
286 | }
287 | 
```

演出が全部終わったら:
- 全消しなら「ALL CLEAR」の表示と音。
- 表示用スコアを本当の値に合わせて（念のため）、アニメーションを終える。

## 毎フレーム: 終了の処理 processEnd

**L288–304**

```ts
288 | function processEnd(now: number): void {
289 |   if (!game || endAt === null || endHandled || now < endAt) return;
290 |   endHandled = true;
291 |   const elapsed = endAt - startAt + penaltyMs;
292 |   if (game.finished === 'cleared') {
293 |     sound.clear();
294 |     renderer.banner('CLEAR!', now, 1100);
295 |     const rec: RunRecord = {
296 |       timeMs: Math.round(elapsed),
297 |       seed: game.seed,
298 |       maxChain: game.maxChain,
299 |       moves: game.moves,
300 |       undos: game.undos,
301 |       date: new Date().toISOString(),
302 |       controlScheme: options.controlScheme,
303 |     };
304 |     const res = submitRecord(target, rec);
```

終了時刻を過ぎたら一度だけ実行する。
- L289: ゲームがない、終わる予定がない、処理済み、まだ時刻前、のどれかなら何もしない。
- L291: **最終タイム** ＝ 終了時刻 − 開始時刻 ＋ ペナルティ。
- L293–294: クリアの音と「CLEAR!」表示。
- L295–304: ランキングに登録する記録を作って保存。

**L305–320**

```ts
305 |     const g = game;
306 |     window.setTimeout(() => {
307 |       if (game !== g || !g.finished) return;
308 |       showResult('cleared', elapsed, res.rank, res.prevBest?.timeMs, res.prevSeedBest?.timeMs);
309 |     }, 750);
310 |   } else {
311 |     sound.dead();
312 |     renderer.banner('窒息…', now, 1100);
313 |     const g = game;
314 |     window.setTimeout(() => {
315 |       if (game !== g || !g.finished) return;
316 |       showResult('dead', elapsed, null);
317 |     }, 750);
318 |   }
319 | }
320 | 
```

- L305–309: 0.75秒後に結果画面を出す（「CLEAR!」の演出を見せるため）。`setTimeout(関数, ミリ秒)` で、指定時間後に関数を呼ぶ。
  - L307: その0.75秒の間にリトライなどで別のゲームになっていたり、1手戻して終了状態が解除されていたりしたら、結果画面は出さない。`g` に今のゲームを控えておき、比べている。
- L310–318: 窒息した場合。記録は残さず、結果画面だけ出す。

## 毎フレーム: 画面上部の表示 updateHud

**L321–331**

```ts
321 | function updateHud(now: number, dt: number): void {
322 |   const elapsed = mode === 'menu' ? 0 : (endAt !== null && now >= endAt ? endAt : now) - startAt + penaltyMs;
323 |   ui.time.textContent = formatTime(game ? elapsed : 0);
324 |   const real = revealedScore;
325 |   shownScore += (real - shownScore) * Math.min(1, dt / 70);
326 |   if (Math.abs(real - shownScore) < 1) shownScore = real;
327 |   ui.score.textContent = fmt(Math.round(shownScore));
328 |   ui.bar.style.width = `${Math.min(100, (shownScore / target) * 100)}%`;
329 |   ui.maxchain.textContent = `${revealedMaxChain}連鎖`;
330 |   ui.moves.textContent = String(game?.moves ?? 0);
331 | 
```

- L322: 表示するタイム。終了時刻を過ぎていれば終了時刻で止め、そうでなければ現在時刻まで。どちらもペナルティを足す。
- L325: 表示スコアを、本当の値との差の一部ずつ近づける（カウントアップ演出）。`dt / 70` で、フレームの間隔に関係なく約70msで追いつく。
- L326: 差が1未満になったらぴったり合わせる。
- L328: 目標点に対する進み具合のバーの長さ（最大100%）。

**L332–345**

```ts
332 |   // 1手戻すボタン（ネクスト列の下に置く）
333 |   const inPlay = mode === 'playing' && !!game;
334 |   ui.undo.hidden = !inPlay;
335 |   if (inPlay) {
336 |     ui.undo.disabled = !canUndo();
337 |     const slot = renderer.sideSlot();
338 |     const h = ui.undo.offsetHeight;
339 |     ui.undo.style.left = `${slot.left}px`;
340 |     ui.undo.style.top = `${slot.bottom - h}px`;
341 |     ui.undo.style.width = `${slot.width}px`;
342 |   }
343 |   ui.resultUndo.hidden = !(mode === 'result' && game?.finished === 'dead' && game.canUndo());
344 | }
345 | 
```

「1手戻す」ボタンの表示。
- L333–334: プレイ中だけ表示。
- L336: 戻せないとき（演出中など）は押せない状態に。
- L337–341: canvas の上に重ねたボタンを、ネクスト列の下端に合わせて置く。canvas の大きさは画面によって変わるので、毎フレーム renderer に位置を聞いて合わせている。
- L343: 結果画面の「1手戻して続ける」ボタンは、窒息して戻せるときだけ表示。

## メインループ frame

**L346–369**

```ts
346 | let last = performance.now();
347 | function frame(now: number): void {
348 |   const dt = Math.min(50, now - last);
349 |   last = now;
350 |   keyboard.update(now);
351 |   processAnimation(now);
352 |   processEnd(now);
353 |   updateHud(now, dt);
354 |   renderer.render(
355 |     {
356 |       field: game ? game.field : emptyField,
357 |       anim,
358 |       current: game && !game.finished ? game.current() : null,
359 |       cursor,
360 |       nexts: game ? game.nexts() : [],
361 |       ghost: !!game && !game.finished,
362 |       cancelHint,
363 |     },
364 |     now,
365 |     dt,
366 |   );
367 |   requestAnimationFrame(frame);
368 | }
369 | 
```

1フレームごとに呼ばれる関数。
- L348: 前のフレームからの経過時間。タブを裏に回していた後などに大きな値になると破片が吹っ飛ぶので、最大50msに抑える。
- L350–353: 長押しの移動 → 演出のきっかけ → 終了の処理 → 上部の表示、の順に更新。
- L354–366: 描画担当に「今描くもの」を渡して描いてもらう。メニュー中は飾りの盤面 `emptyField` を描く。
- L367: `requestAnimationFrame(frame)` … 「次に画面を描き替えるタイミングで、もう一度 frame を呼んで」とブラウザに頼む。これで画面のリフレッシュレート（多くは60回/秒）に合わせてループし続ける。

**L370–385**

```ts
370 | // メニュー中に盤面に飾りとして並べる宝石
371 | const emptyField = Field.fromRows([
372 |   '......',
373 |   '......',
374 |   '......',
375 |   '......',
376 |   '......',
377 |   '......',
378 |   '......',
379 |   '3.....',
380 |   '20...1',
381 |   '201.31',
382 |   '120331',
383 |   '112002',
384 | ]);
385 | 
```

メニュー画面の背景に置く飾りの盤面。`Field.fromRows` に画面の見た目どおりの文字列で書いている。
`const` は宣言より前で使うとエラーになるが、`frame()` が実際に呼ばれるのはファイルの最後（L595）より後なので問題ない。

## 画面の切り替え showOverlay

**L386–395**

```ts
386 | // ---------- オーバーレイ ----------
387 | type OverlayName = 'menu' | 'options' | 'ranking' | 'result';
388 | function showOverlay(name: OverlayName | null): void {
389 |   ui.menu.hidden = name !== 'menu';
390 |   ui.options.hidden = name !== 'options';
391 |   ui.ranking.hidden = name !== 'ranking';
392 |   ui.result.hidden = name !== 'result';
393 |   if (name === 'menu') $('start').focus();
394 | }
395 | 
```

メニュー・オプション・ランキング・結果のうち、指定したものだけを表示し、残りを隠す。`null` なら全部隠す（プレイ画面だけになる）。
HTML 要素の `hidden` を true にすると非表示になる。メニューを開いたときは、Enter ですぐ始められるようスタートボタンにフォーカスを当てる。

## 結果画面 showResult

**L396–404**

```ts
396 | function showResult(kind: 'cleared' | 'dead', elapsed: number, rank: number | null, prevBest?: number, prevSeedBest?: number): void {
397 |   if (!game) return;
398 |   mode = 'result';
399 |   const kindEl = $('result-kind');
400 |   kindEl.textContent = kind === 'cleared' ? (rank === 1 ? 'NEW RECORD' : 'CLEAR') : '窒息';
401 |   kindEl.classList.toggle('dead', kind === 'dead');
402 |   $('result-time').textContent = formatTime(elapsed);
403 |   const delta = $('result-delta');
404 |   delta.className = 'result-delta';
```

- 引数: 種類（クリア／窒息）、タイム、順位、これまでのベスト、このシードでのベスト。最後の2つは `?` 付きで省略可能。
- L400: 見出し。1位なら「NEW RECORD」。
- L401: `classList.toggle('dead', 条件)` … 条件が真ならクラスを付け、偽なら外す。窒息なら赤い見出しにする。
- L404: 差分表示のクラスをいったんリセット。

**L405–424**

```ts
405 |   if (kind === 'cleared') {
406 |     const parts: string[] = [];
407 |     if (prevBest !== undefined) {
408 |       const d = elapsed - prevBest;
409 |       parts.push(`ベスト ${d <= 0 ? '−' : '+'}${formatTime(Math.abs(d))}`);
410 |       delta.classList.add(d <= 0 ? 'better' : 'worse');
411 |     } else {
412 |       parts.push('初記録');
413 |       delta.classList.add('better');
414 |     }
415 |     if (prevSeedBest !== undefined) {
416 |       const d = elapsed - prevSeedBest;
417 |       parts.push(`このシード ${d <= 0 ? '−' : '+'}${formatTime(Math.abs(d))}`);
418 |     }
419 |     if (rank) parts.push(`${rank}位`);
420 |     delta.textContent = parts.join('　');
421 |   } else {
422 |     delta.textContent = game.canUndo() ? `1手戻すと +${CONFIG.UNDO_PENALTY_MS / 1000}秒で続行できます` : '記録なし';
423 |     delta.classList.add('worse');
424 |   }
```

- クリアの場合: ベストとの差を「ベスト −0:01.23」の形で作る。速ければ（差が0以下）緑、遅ければ赤。初めての記録なら「初記録」。シード別ベストとの差、順位も並べて、全角スペースでつなぐ。
- 窒息の場合: 1手戻せるなら「1手戻すと +5秒で続行できます」と案内する。

**L425–434**

```ts
425 |   $('result-target').textContent = fmt(target);
426 |   $('result-score').textContent = fmt(game.score);
427 |   $('result-seed').textContent = String(game.seed);
428 |   $('result-chain').textContent = `${game.maxChain}連鎖`;
429 |   $('result-moves').textContent = String(game.moves);
430 |   $('result-undos').textContent = String(game.undos);
431 |   showOverlay('result');
432 |   $('retry').focus();
433 | }
434 | 
```

目標点・スコア・シード・最大連鎖・手数・戻した回数を表示して、結果画面を開く。Enter ですぐリトライできるようリトライボタンにフォーカス。

## メニューの組み立て

**L435–452**

```ts
435 | // ---------- メニューの組み立て ----------
436 | function renderTargets(): void {
437 |   ui.targets.replaceChildren(
438 |     ...CONFIG.TARGETS.map((t) => {
439 |       const b = document.createElement('button');
440 |       b.type = 'button';
441 |       b.className = 'seg-btn';
442 |       b.textContent = targetLabel(t);
443 |       b.setAttribute('aria-pressed', String(t === target));
444 |       b.addEventListener('click', () => {
445 |         target = t;
446 |         renderTargets();
447 |       });
448 |       return b;
449 |     }),
450 |   );
451 | }
452 | 
```

`renderTargets()` … 目標点のボタンを作り直す。
- `replaceChildren(...)` … 中身を丸ごと入れ替える。`...配列` で配列の要素を引数として並べて渡す。
- 各目標点についてボタンを作り（`document.createElement('button')`）、選ばれているものには `aria-pressed="true"` を付ける。CSS はこの属性を見て金色の「選択中」の見た目にする。`aria-pressed` は読み上げソフトにも「押されている」と伝わる。
- クリックされたら、その目標点を選んで作り直す。

**L453–460**

```ts
453 | function setSeedMode(m: 'random' | 'fixed'): void {
454 |   seedMode = m;
455 |   ui.seedRandom.setAttribute('aria-pressed', String(m === 'random'));
456 |   ui.seedFixed.setAttribute('aria-pressed', String(m === 'fixed'));
457 |   ui.seedInput.disabled = m === 'random';
458 |   if (m === 'fixed') ui.seedInput.focus();
459 | }
460 | 
```

`setSeedMode(m)` … シードの選び方を切り替える。ランダムなら番号の入力欄を無効にし、番号指定なら入力欄にカーソルを移す。

**L461–475**

```ts
461 | function renderHowto(): void {
462 |   const arrow =
463 |     '<b>キーボード</b>　<kbd>←</kbd><kbd>→</kbd> 移動　<kbd>Z</kbd><kbd>X</kbd> 回転　<kbd>↓</kbd>/<kbd>↑</kbd> 設置';
464 |   const direct =
465 |     '<b>キーボード</b>　<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> 子ぷよの向き　<kbd>H</kbd><kbd>J</kbd><kbd>K</kbd><kbd>L</kbd><kbd>;</kbd><kbd>\'</kbd> その列に設置';
466 |   const touch =
467 |     options.touchScheme === 'twohand'
468 |       ? '<b>タッチ（両手）</b>　左半分を横にスワイプで列、右半分をフリックで子ぷよの向き。右を先に離すと設置、左を先に離すと取り消し'
469 |       : '<b>タッチ</b>　列をタップで縦置き、フリックで子ぷよの向き。盤面の外まで引っぱるか2本目の指でタップすると取り消し（マウスは右クリック）';
470 |   const common = `${touch}<br><kbd>Q</kbd> 1手戻す(+5秒)　<kbd>R</kbd> リトライ　<kbd>N</kbd> 新しいシード　<kbd>Esc</kbd> メニュー`;
471 |   const key = options.controlScheme === 'arrow' ? arrow : direct;
472 |   ui.howto.innerHTML = `${key}<br>${common}`;
473 |   ui.keyhelp.innerHTML = `${key.replace('<b>キーボード</b>　', '')}<br><kbd>Q</kbd>/<kbd>BS</kbd> 1手戻す(+5秒)<br><kbd>R</kbd> リトライ　<kbd>N</kbd> 新シード<br><kbd>Esc</kbd> メニュー`;
474 | }
475 | 
```

`renderHowto()` … 遊び方の説明文を、今の操作方式に合わせて作る。メニュー画面用（`howto`）と、PCのプレイ画面右側用（`keyhelp`）の2か所。`<kbd>` はキーボードのキーを表す HTML の要素で、CSS でキーっぽい見た目にしている。
タッチの説明も、片手モードと両手モードで出し分ける。


## オプションの反映 applyOptions

**L476–509**

```ts
476 | function applyOptions(): void {
477 |   keyboard.scheme = options.controlScheme;
478 |   pointer.threshold = options.flickThreshold;
479 |   pointer.enabled = options.touchScheme === 'single';
480 |   twoHand.enabled = options.touchScheme === 'twohand';
481 |   twoHand.threshold = options.flickThreshold;
482 |   twoHand.columnStep = options.columnStep;
483 |   sound.setVolume(options.sfxVolume);
484 |   for (const b of $('opt-scheme').querySelectorAll<HTMLButtonElement>('.seg-btn')) {
485 |     b.setAttribute('aria-pressed', String(b.dataset.value === options.controlScheme));
486 |   }
487 |   for (const b of $('opt-spawn-col').querySelectorAll<HTMLButtonElement>('.seg-btn')) {
488 |     b.setAttribute('aria-pressed', String(b.dataset.value === options.spawnCol));
489 |   }
490 |   for (const b of $('opt-spawn-rot').querySelectorAll<HTMLButtonElement>('.seg-btn')) {
491 |     b.setAttribute('aria-pressed', String(b.dataset.value === options.spawnRot));
492 |   }
493 |   for (const b of $('opt-touch').querySelectorAll<HTMLButtonElement>('.seg-btn')) {
494 |     b.setAttribute('aria-pressed', String(b.dataset.value === options.touchScheme));
495 |   }
496 |   const step = $<HTMLInputElement>('opt-step');
497 |   step.value = String(options.columnStep);
498 |   $('opt-step-out').textContent = `${options.columnStep}px`;
499 |   $('opt-step-group').hidden = options.touchScheme !== 'twohand';
500 |   const flick = $<HTMLInputElement>('opt-flick');
501 |   flick.value = String(options.flickThreshold);
502 |   $('opt-flick-out').textContent = `${options.flickThreshold}px`;
503 |   const vol = $<HTMLInputElement>('opt-volume');
504 |   vol.value = String(options.sfxVolume);
505 |   $('opt-volume-out').textContent = `${Math.round(options.sfxVolume * 100)}%`;
506 |   renderHowto();
507 |   saveOptions(options);
508 | }
509 | 
```

オプションが変わるたびに呼ぶ。
- L477–483: 入力・音に設定を反映。タッチは片手（`pointer`）と両手（`twoHand`）のどちらか一方だけを `enabled` にする。
- L484–495: 操作方式・次のペアの列・子ぷよの向き・タッチ操作のボタンの選択状態を更新。`querySelectorAll('.seg-btn')` でその中のボタンを全部取り、`data-value` 属性（HTML の `data-value="arrow"`。JavaScript からは `dataset.value`）と比べる。
- L496–505: スライダーの位置と、横の数値表示を更新。「1列動かす距離」のスライダーは両手モードのときだけ表示する（`hidden`）。
- L506–507: 説明文を作り直して、設定を保存。


## ランキング画面 renderRanking

**L510–526**

```ts
510 | function renderRanking(): void {
511 |   ui.rankTabs.replaceChildren(
512 |     ...CONFIG.TARGETS.map((t) => {
513 |       const b = document.createElement('button');
514 |       b.type = 'button';
515 |       b.className = 'seg-btn';
516 |       b.textContent = targetLabel(t);
517 |       b.setAttribute('aria-pressed', String(t === rankTarget));
518 |       b.addEventListener('click', () => {
519 |         rankTarget = t;
520 |         renderRanking();
521 |       });
522 |       return b;
523 |     }),
524 |   );
525 |   ui.rankNote.hidden = configSignature() === 'default';
526 |   const list = getRanking(rankTarget);
```

- L511–524: 目標点のタブを作る（目標点ボタンと同じ作り方）。
- L525: 設定定数を変えているなら「別枠の記録です」という注意を出す。
- L526: その目標点の記録を読み込む。

**L527–554**

```ts
527 |   if (list.length === 0) {
528 |     ui.rankBody.innerHTML = '<tr><td class="empty" colspan="7">まだ記録がありません。最初の1本を走ろう。</td></tr>';
529 |     return;
530 |   }
531 |   ui.rankBody.replaceChildren(
532 |     ...list.map((r, i) => {
533 |       const tr = document.createElement('tr');
534 |       if (i === 0) tr.className = 'top';
535 |       const d = new Date(r.date);
536 |       const cells = [
537 |         String(i + 1),
538 |         formatTime(r.timeMs),
539 |         String(r.seed),
540 |         `${r.maxChain}`,
541 |         String(r.moves),
542 |         String(r.undos ?? 0),
543 |         `${d.getMonth() + 1}/${d.getDate()}`,
544 |       ];
545 |       for (const c of cells) {
546 |         const td = document.createElement('td');
547 |         td.textContent = c;
548 |         tr.append(td);
549 |       }
550 |       return tr;
551 |     }),
552 |   );
553 | }
554 | 
```

- L527–530: 記録がなければ「まだ記録がありません」の行だけ出す。`innerHTML` は HTML の文字列で中身を書き換える。
- L531–552: 記録1件ごとに表の行（`tr`）を作る。1位の行には `top` クラスを付けて金色にする。
- L535: 保存していた日時の文字列から日付を作る。
- L536–544: 各列の文字。`r.undos ?? 0` は、1手戻す機能を入れる前の記録（`undos` がない）なら0と表示。`getMonth()` は0始まり（1月が0）なので1を足す。
- L545–549: セル（`td`）を作って行に追加。`textContent` で入れると、文字列が HTML として解釈されないので安全。

## ボタンなどのイベント

**L555–572**

```ts
555 | // ---------- イベント ----------
556 | ui.seedRandom.addEventListener('click', () => setSeedMode('random'));
557 | ui.seedFixed.addEventListener('click', () => setSeedMode('fixed'));
558 | $('start').addEventListener('click', () => startGame(chosenSeed()));
559 | $('open-options').addEventListener('click', () => showOverlay('options'));
560 | $('close-options').addEventListener('click', () => showOverlay('menu'));
561 | $('open-ranking').addEventListener('click', () => {
562 |   rankTarget = target;
563 |   renderRanking();
564 |   showOverlay('ranking');
565 | });
566 | $('close-ranking').addEventListener('click', () => showOverlay('menu'));
567 | $('retry').addEventListener('click', () => handlers.retry());
568 | $('new-seed').addEventListener('click', () => handlers.newSeed());
569 | $('to-menu').addEventListener('click', goMenu);
570 | ui.undo.addEventListener('click', undo);
571 | ui.resultUndo.addEventListener('click', undo);
572 | 
```

各ボタンが押されたときの処理を登録する。`addEventListener('click', 関数)`。

**L573–590**

```ts
573 | for (const b of $('opt-scheme').querySelectorAll<HTMLButtonElement>('.seg-btn')) {
574 |   b.addEventListener('click', () => {
575 |     options = { ...options, controlScheme: b.dataset.value as Options['controlScheme'] };
576 |     applyOptions();
577 |   });
578 | }
579 | for (const b of $('opt-spawn-col').querySelectorAll<HTMLButtonElement>('.seg-btn')) {
580 |   b.addEventListener('click', () => {
581 |     options = { ...options, spawnCol: b.dataset.value as Options['spawnCol'] };
582 |     applyOptions();
583 |   });
584 | }
585 | for (const b of $('opt-spawn-rot').querySelectorAll<HTMLButtonElement>('.seg-btn')) {
586 |   b.addEventListener('click', () => {
587 |     options = { ...options, spawnRot: b.dataset.value as Options['spawnRot'] };
588 |     applyOptions();
589 |   });
590 | }
```

オプションの操作方式・次のペアの列・子ぷよの向きのボタン。押されたら、そのボタンの値で設定を更新して反映する。


**L591–600**

```ts
591 | for (const b of $('opt-touch').querySelectorAll<HTMLButtonElement>('.seg-btn')) {
592 |   b.addEventListener('click', () => {
593 |     options = { ...options, touchScheme: b.dataset.value as Options['touchScheme'] };
594 |     applyOptions();
595 |   });
596 | }
597 | $<HTMLInputElement>('opt-step').addEventListener('input', (e) => {
598 |   options = { ...options, columnStep: Number((e.target as HTMLInputElement).value) };
599 |   applyOptions();
600 | });
```

タッチ操作（片手／両手）のボタンと、両手モードで1列動かす距離のスライダー。作り方は上と同じ。

**L601–610**

```ts
601 | $<HTMLInputElement>('opt-flick').addEventListener('input', (e) => {
602 |   options = { ...options, flickThreshold: Number((e.target as HTMLInputElement).value) };
603 |   applyOptions();
604 | });
605 | $<HTMLInputElement>('opt-volume').addEventListener('input', (e) => {
606 |   options = { ...options, sfxVolume: Number((e.target as HTMLInputElement).value) };
607 |   applyOptions();
608 |   sound.unlock();
609 |   sound.pop(3);
610 | });
```

スライダー。`input` イベントは、つまみを動かしている最中にも何度も届く。
音量スライダーは、動かすたびにキィン音を鳴らして音量を確かめられるようにしている。

## 記録の全削除（2回押し）

**L611–626**

```ts
611 | const clearBtn = $<HTMLButtonElement>('clear-records');
612 | clearBtn.addEventListener('click', () => {
613 |   if (clearBtn.dataset.armed === 'true') {
614 |     clearRecords();
615 |     clearBtn.dataset.armed = 'false';
616 |     clearBtn.textContent = '削除しました';
617 |     return;
618 |   }
619 |   clearBtn.dataset.armed = 'true';
620 |   clearBtn.textContent = 'もう一度押すと削除';
621 |   window.setTimeout(() => {
622 |     clearBtn.dataset.armed = 'false';
623 |     clearBtn.textContent = '記録をすべて削除';
624 |   }, 3000);
625 | });
626 | 
```

うっかり消さないよう、1回目は「もう一度押すと削除」に変わるだけ。3秒以内にもう一度押すと削除する。
`dataset.armed` は HTML の `data-armed` 属性。押せる状態かどうかを要素自体に覚えさせ、CSS でも見た目を変えている。

**L627–628**

```ts
627 | new ResizeObserver(() => renderer.resize()).observe($('stage'));
628 | 
```

`ResizeObserver` … 指定した要素の大きさが変わったら知らせてくれる仕組み。盤面のエリアの大きさが変わるたびにレイアウトを計算し直す。

## 起動

**L629–633**

```ts
629 | // ---------- 起動 ----------
630 | renderTargets();
631 | applyOptions();
632 | showOverlay('menu');
633 | requestAnimationFrame(frame);
```

ページを開いたときに1回だけ実行される部分。目標点のボタンを作り、オプションを反映し、メニューを開き、メインループを始める。
