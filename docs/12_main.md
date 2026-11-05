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

**L1–20**

```ts
  1 | import './style.css';
  2 | import { registerSW } from 'virtual:pwa-register';
  3 | import { CONFIG, configSignature } from './config';
  4 | import { sound } from './audio/sound';
  5 | import { Field, clampPlacement, type Rotation } from './core/field';
  6 | import { Game } from './core/game';
  7 | import { randomSeed } from './core/tsumo';
  8 | import { Keyboard, Pointer, TwoHand, type ControlHandlers } from './input/controls';
  9 | import { ButtonPad } from './input/pad';
 10 | import { Renderer, type Cursor, type TurnAnimation } from './render/renderer';
 11 | import {
 12 |   clearRecords,
 13 |   getRanking,
 14 |   loadOptions,
 15 |   saveOptions,
 16 |   submitRecord,
 17 |   type Options,
 18 |   type RunRecord,
 19 | } from './storage';
 20 | 
```

- L1: CSS を読み込む。Vite がこれを見てページにスタイルを適用する（`vite-env.d.ts` の宣言で TypeScript にも CSS の import を許可している）。
- L2: オフライン対応（PWA）の登録をする関数。`virtual:pwa-register` は実際のファイルではなく、ビルドの道具（vite-plugin-pwa）がその場で用意するモジュール。
- L3–19: 各ファイルから必要なものを読み込む。`import { ... } from` を複数行に分けて書くこともできる。L9 の `ButtonPad` はボタン方式のタッチ操作。

## 画面の部品を取ってくる

**L21–23**

```ts
 21 | // ---------- DOM ----------
 22 | const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
 23 | const canvas = $<HTMLCanvasElement>('board');
```

- L22: `$` という短い名前の関数を作る。`document.getElementById(id)` で HTML の部品を id で探す。
  - `<T extends HTMLElement = HTMLElement>` はジェネリクス。`$<HTMLButtonElement>('undo')` のように書くと「ボタンとして」取り出せて、ボタン専用の機能（`disabled` など）が使える。何も書かなければ普通の HTML 要素。
  - `as T` は「この型だと思って扱ってよい」という指定。
- L23: 盤面を描く canvas。

**L24–49**

```ts
 24 | const ui = {
 25 |   time: $('time'),
 26 |   score: $('score'),
 27 |   target: $('target'),
 28 |   bar: $('bar'),
 29 |   seed: $('seed'),
 30 |   maxchain: $('maxchain'),
 31 |   moves: $('moves'),
 32 |   keyhelp: $('keyhelp'),
 33 |   penalty: $('penalty'),
 34 |   undo: $<HTMLButtonElement>('undo'),
 35 |   resultUndo: $<HTMLButtonElement>('result-undo'),
 36 |   menu: $('menu'),
 37 |   options: $('options'),
 38 |   ranking: $('ranking'),
 39 |   result: $('result'),
 40 |   targets: $('targets'),
 41 |   seedRandom: $<HTMLButtonElement>('seed-random'),
 42 |   seedFixed: $<HTMLButtonElement>('seed-fixed'),
 43 |   seedInput: $<HTMLInputElement>('seed-input'),
 44 |   howto: $('howto'),
 45 |   rankTabs: $('rank-tabs'),
 46 |   rankBody: $('rank-body'),
 47 |   rankNote: $('rank-note'),
 48 | };
 49 | 
```

よく使う画面の部品をまとめて取り出し、`ui.time` のような名前で使えるようにしておく。毎回 `getElementById` するより速く、書くのも楽。

## 表示用の小さな関数

**L50–57**

```ts
 50 | // ---------- 表示用ユーティリティ ----------
 51 | export function formatTime(ms: number): string {
 52 |   const cs = Math.floor(Math.max(0, ms) / 10);
 53 |   const m = Math.floor(cs / 6000);
 54 |   const s = Math.floor((cs % 6000) / 100);
 55 |   const c = cs % 100;
 56 |   return `${m}:${String(s).padStart(2, '0')}.${String(c).padStart(2, '0')}`;
 57 | }
```

`formatTime(ms)` … ミリ秒を `1:23.45` の形にする。
- L52: 1/100秒単位（センチ秒）に直す。`Math.max(0, ms)` で負にならないようにする。
- L53: 分 = 6000センチ秒ごとに1。
- L54: 秒 = 分を除いた残りを100で割る。
- L55: 1/100秒の部分。
- L56: `padStart(2, '0')` で、1桁なら頭に0をつけて2桁にする（`5` → `05`）。

**L58–60**

```ts
 58 | const fmt = (n: number) => n.toLocaleString('en-US');
 59 | const targetLabel = (t: number) => (t >= 10_000 ? `${t / 10_000}万` : fmt(t));
 60 | 
```

- `fmt(n)` … 3桁ごとにカンマ（`100000` → `100,000`）。
- `targetLabel(t)` … 目標点を「10万」「1000万」のような日本語表記にする。

## アプリの状態

**L61–63**

```ts
 61 | // ---------- 状態 ----------
 62 | type Mode = 'menu' | 'playing' | 'result';
 63 | 
```

`Mode` … 今どの画面か。`'menu'`（メニュー）、`'playing'`（プレイ中）、`'result'`（結果画面）。

**L64–84**

```ts
 64 | let options: Options = loadOptions();
 65 | let mode: Mode = 'menu';
 66 | let target = CONFIG.TARGETS[0];
 67 | let seedMode: 'random' | 'fixed' = 'random';
 68 | let game: Game | null = null;
 69 | let cursor: Cursor = { x: 2, rot: 0 };
 70 | let anim: TurnAnimation | null = null;
 71 | let firedPops = 0;
 72 | let startAt = 0;
 73 | let busyUntil = 0;
 74 | let endAt: number | null = null;
 75 | let endHandled = false;
 76 | let shownScore = 0;
 77 | let revealedScore = 0;
 78 | let revealedMaxChain = 0;
 79 | /** 1手戻したぶんの合計ペナルティ */
 80 | let penaltyMs = 0;
 81 | /** タッチ/マウスで「離すとキャンセル」の位置にいる */
 82 | let cancelHint = false;
 83 | let rankTarget = target;
 84 | 
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

**L85–86**

```ts
 85 | const renderer = new Renderer(canvas);
 86 | 
```

描画担当を作る。

## ゲーム操作

**L87–91**

```ts
 87 | // ---------- ゲーム操作 ----------
 88 | function canControl(): boolean {
 89 |   return mode === 'playing' && !!game && !game.finished && performance.now() >= busyUntil;
 90 | }
 91 | 
```

`canControl()` … 操作を受け付けてよいか。プレイ中で、ゲームがあって、終わっていなくて、演出が終わっている。`!!game` は「game が null でなければ true」にする書き方。

## ゲーム開始 startGame

**L92–115**

```ts
 92 | function startGame(seed: number): void {
 93 |   sound.unlock();
 94 |   game = new Game(seed, target);
 95 |   cursor = { x: 2, rot: 0 };
 96 |   anim = null;
 97 |   firedPops = 0;
 98 |   busyUntil = 0;
 99 |   endAt = null;
100 |   endHandled = false;
101 |   shownScore = 0;
102 |   revealedScore = 0;
103 |   revealedMaxChain = 0;
104 |   penaltyMs = 0;
105 |   cancelHint = false;
106 |   ui.penalty.hidden = true;
107 |   ui.score.style.minWidth = `${fmt(target).length}ch`;
108 |   renderer.clearEffects();
109 |   mode = 'playing';
110 |   showOverlay(null);
111 |   ui.seed.textContent = String(seed);
112 |   ui.target.textContent = fmt(target);
113 |   startAt = performance.now();
114 | }
115 | 
```

- L93: 音を使えるようにする（ボタンやキーを押した直後なのでブラウザが許可してくれる）。
- L94: 新しいゲームを作る。
- L95–106: 状態をすべて初期化。
- L107: スコアの表示幅を、目標点の桁数ぶん確保する（`ch` は数字1文字ぶんの幅）。点数が増えて桁が増えても横にずれないようにするため。
- L108–112: エフェクトを消し、プレイ中にして、画面の上に重なっている画面を全部閉じ、シードと目標点を表示。
- L113: 最後に開始時刻を記録。準備の処理時間がタイムに入らないよう、一番最後に取る。

**L116–122**

```ts
116 | function canUndo(): boolean {
117 |   if (!game || !game.canUndo() || performance.now() < busyUntil) return false;
118 |   if (mode === 'playing') return true;
119 |   // 窒息した直後（結果画面）からも戻せる
120 |   return mode === 'result' && game.finished === 'dead';
121 | }
122 | 
```

`canUndo()` … 今1手戻せるか。演出中は不可。プレイ中なら可、結果画面なら窒息したときだけ可。

## 1手戻す undo

**L123–149**

```ts
123 | function undo(): void {
124 |   if (!game || !canUndo()) return;
125 |   const now = performance.now();
126 |   const prev = game.undo();
127 |   if (!prev) return;
128 |   penaltyMs += CONFIG.UNDO_PENALTY_MS;
129 |   cursor = { x: clampPlacement(prev.x, prev.rot), rot: prev.rot };
130 |   anim = null;
131 |   endAt = null;
132 |   endHandled = false;
133 |   revealedScore = game.score;
134 |   shownScore = game.score;
135 |   revealedMaxChain = game.maxChain;
136 |   renderer.clearEffects();
137 |   renderer.banner(`+${CONFIG.UNDO_PENALTY_MS / 1000}秒`, now, 600);
138 |   ui.penalty.hidden = false;
139 |   ui.penalty.textContent = `ペナルティ +${formatTime(penaltyMs)}`;
140 |   ui.penalty.classList.remove('flash');
141 |   void ui.penalty.offsetWidth;
142 |   ui.penalty.classList.add('flash');
143 |   sound.undo();
144 |   if (mode === 'result') {
145 |     mode = 'playing';
146 |     showOverlay(null);
147 |   }
148 | }
149 | 
```

- L126: ゲームに1手戻してもらう。置いていた位置と向きが返ってくる。
- L128: ペナルティを加算。タイム表示は「経過時間 + penaltyMs」なので、これで +5秒になる。
- L129: カーソルを取り消した手の位置へ。置き直しやすくするため。
- L130–135: アニメーションと終了状態を解除し、表示用のスコアなどをゲームの値に合わせる。
- L136–137: エフェクトを消して、中央に「+5秒」を出す。
- L138–142: ペナルティ表示を更新し、点滅アニメーションをかけ直す。CSS アニメーションは同じクラスを付け直しても再生されないので、一度外し、`offsetWidth` を読んでブラウザに「外した状態」を確定させてから（**リフロー**を起こす小技）付け直している。
- L144–147: 結果画面（窒息）から戻した場合は、プレイ中に戻して結果画面を閉じる。

**L150–157**

```ts
150 | function chosenSeed(): number {
151 |   if (seedMode === 'fixed') {
152 |     const v = Math.floor(Number(ui.seedInput.value));
153 |     if (v >= 1 && v <= CONFIG.SEED_COUNT) return v;
154 |   }
155 |   return randomSeed();
156 | }
157 | 
```

`chosenSeed()` … メニューの設定からシードを決める。番号指定で、入力が 1〜65536 の範囲ならその番号。それ以外（ランダム、または入力が空・範囲外）はランダム。

## 1手置く placeAt

**L158–163**

```ts
158 | function placeAt(x: number, rot: Rotation): void {
159 |   if (!game || !canControl()) return;
160 |   const now = performance.now();
161 |   const before: Field = game.field.clone();
162 |   const turn = game.place(x, rot);
163 | 
```

- L159: 操作できなければ何もしない。
- L161: 置く前の盤面を複製しておく（アニメーションで使う）。
- L162: ゲームに置いてもらう。この1行で連鎖の計算まで全部終わる。

**L164–172**

```ts
164 |   // アニメーション用に各段階の盤面を作る
165 |   const f = before.clone();
166 |   f.place(turn.pair, x, rot);
167 |   const frames = [f.clone()];
168 |   for (const step of turn.chain.steps) {
169 |     f.removeAndFall(step.cleared);
170 |     frames.push(f.clone());
171 |   }
172 |   anim = { turn, before, frames, start: now };
```

アニメーション用に、各段階の盤面を作り直す。
- 置く前の盤面の複製に同じように置き（`frames[0]`）、各連鎖の消去を順に再現して、そのたびに複製を記録する。
- ゲーム本体は最後の盤面しか持っていないので、途中の盤面はこうして作る。
- L172: アニメーションの情報をまとめる。

**L173–182**

```ts
173 |   firedPops = 0;
174 |   busyUntil = now + turn.timeline.total;
175 |   if (turn.cleared || turn.dead) endAt = busyUntil;
176 |   sound.place();
177 | 
178 |   const nextRot = options.spawnRot === 'keep' ? rot : 0;
179 |   const nextX = options.spawnCol === 'keep' ? x : 2;
180 |   cursor = { x: clampPlacement(nextX, nextRot), rot: nextRot };
181 | }
182 | 
```

- L174: 演出が終わる時刻まで操作を止める。
- L175: この手でクリアか窒息したなら、終了時刻は演出が終わる瞬間。**タイムは最後の連鎖が終わった瞬間で確定**、という仕様はここで決まる。
- L178–180: 次のペアの開始位置。向きと列はオプションで別々に決める。向きは「上に戻す」なら 0、「引き継ぐ」なら今置いた向き。列は「戻す」なら3列目（`2`）、「引き継ぐ」なら今置いた列。最後に `clampPlacement` で、横向きのときに盤面からはみ出さない列に直す。


## 入力に渡す操作の一覧 handlers

**L183–196**

```ts
183 | const handlers: ControlHandlers = {
184 |   canControl,
185 |   move(dx) {
186 |     const min = cursor.rot === 3 ? 1 : 0;
187 |     const max = cursor.rot === 1 ? 4 : 5;
188 |     const nx = cursor.x + dx;
189 |     if (nx < min || nx > max) return false;
190 |     cursor = { ...cursor, x: nx };
191 |     sound.move();
192 |     return true;
193 |   },
194 |   moveToWall(dx) {
195 |     while (handlers.move(dx));
196 |   },
```

`controls.ts` の `ControlHandlers` の形どおりに、実際の処理を書いたオブジェクト。`canControl,` は `canControl: canControl` の省略形。
- `move(dx)` … カーソルを左右に動かす。向きによって動ける範囲が違う（子が左なら1列目より左には行けない、子が右なら5列目まで）。動けたら移動音を鳴らして true。
- `moveToWall(dx)` … 動けなくなるまで `move` をくり返す。`while (条件);` は中身のない while で、条件の関数を呼ぶこと自体が処理になっている。

**L197–211**

```ts
197 |   rotate(dir) {
198 |     const rot = ((cursor.rot + dir + 4) % 4) as Rotation;
199 |     cursor = { x: clampPlacement(cursor.x, rot), rot };
200 |     sound.rotate();
201 |   },
202 |   setRotation(rot) {
203 |     cursor = { x: clampPlacement(cursor.x, rot), rot };
204 |   },
205 |   place() {
206 |     placeAt(cursor.x, cursor.rot);
207 |   },
208 |   placeAt(col) {
209 |     cursor = { ...cursor, x: col };
210 |     placeAt(col, cursor.rot);
211 |   },
```

- `rotate(dir)` … 向きを回す。`+ 4` してから `% 4` するのは、左回転で -1 になったときに `3` に戻すため（`-1 % 4` は JavaScript では `-1` になってしまう）。回した後に壁からはみ出すなら `clampPlacement` で内側にずらす（壁蹴り）。
- `setRotation(rot)` … 向きを直接指定（直接指定方式）。
- `place()` … 今のカーソル位置に置く。
- `placeAt(col)` … 指定した列に置く（直接指定方式の HJKL;'）。

**L212–226**

```ts
212 |   preview(col, rot, outside) {
213 |     cursor = { x: col, rot };
214 |     cancelHint = outside;
215 |   },
216 |   cancelled() {
217 |     cancelHint = false;
218 |     sound.cancel();
219 |   },
220 |   pointerPlace(col, rot) {
221 |     placeAt(col, rot);
222 |   },
223 |   cursor() {
224 |     return { col: cursor.x, rot: cursor.rot };
225 |   },
226 |   undo,
```

- `preview` … タッチ中、カーソルを指の位置と向きに合わせ、キャンセル表示のオンオフを覚える。
- `cancelled` … キャンセル音を鳴らす。
- `pointerPlace` … タッチで置く。
- `cursor` … 今のカーソルの列と向きを返す。両手モードが、指を置いたときの起点にする。
- `undo,` … 上で定義した `undo` 関数をそのまま渡す。


**L227–248**

```ts
227 |   retry() {
228 |     if (mode === 'menu' || !game) return;
229 |     startGame(game.seed);
230 |   },
231 |   newSeed() {
232 |     if (mode === 'menu') return;
233 |     startGame(randomSeed());
234 |   },
235 |   menu() {
236 |     // オプション・ランキングはメニューから開くので、閉じてメニューに戻る
237 |     if (!ui.options.hidden || !ui.ranking.hidden) {
238 |       showOverlay('menu');
239 |       return;
240 |     }
241 |     goMenu();
242 |   },
243 |   start() {
244 |     if (mode === 'menu' && ui.options.hidden && ui.ranking.hidden) startGame(chosenSeed());
245 |     else if (mode === 'result') startGame(game ? game.seed : chosenSeed());
246 |   },
247 | };
248 | 
```

- `retry` … 同じシードで最初から。メニュー中は何もしない。
- `newSeed` … ランダムな新しいシードで最初から。
- `menu`（Esc）… オプションやランキングを開いていればメニューに戻るだけ。そうでなければ（プレイ中・結果画面）メニューへ。
- `start`（Enter / Space）… メニュー画面ならゲーム開始。結果画面なら同じシードでもう一度。

**L249–258**

```ts
249 | const keyboard = new Keyboard(handlers);
250 | const pointer = new Pointer(
251 |   canvas,
252 |   (x, y) => renderer.columnAt(x, y),
253 |   (x, y) => renderer.isOutside(x, y),
254 |   handlers,
255 | );
256 | const twoHand = new TwoHand(canvas, handlers);
257 | const pad = new ButtonPad($('pad'), handlers);
258 | 
```

キーボードとタッチの入力を作る。タッチには、列を求める関数と盤面外を判定する関数を renderer から渡す（`(x, y) => renderer.columnAt(x, y)` のように包んで渡す）。
タッチは片手モード（`Pointer`）・両手モード（`TwoHand`）・ボタン方式（`ButtonPad`）の3つを作っておき、オプションで選んだものだけを有効にする（下の `applyOptions`）。ボタン方式は盤面の下の `#pad` にボタンを並べる。

**L259–267**

```ts
259 | function goMenu(): void {
260 |   mode = 'menu';
261 |   game = null;
262 |   anim = null;
263 |   renderer.clearEffects();
264 |   showOverlay('menu');
265 |   applyUpdateIfIdle();
266 | }
267 | 
```

`goMenu()` … メニューに戻る。ゲームを捨てて、エフェクトも消す。
新しい版が届いていれば、ここで切り替える（下の「オフライン対応」の `applyUpdateIfIdle`）。


## 毎フレーム: 演出のきっかけ processAnimation

**L268–281**

```ts
268 | // ---------- 1フレームごとの処理 ----------
269 | function processAnimation(now: number): void {
270 |   if (!anim || !game) return;
271 |   const e = now - anim.start;
272 |   const steps = anim.turn.chain.steps;
273 |   const tl = anim.turn.timeline;
274 |   while (firedPops < steps.length && e >= tl.steps[firedPops].popStart) {
275 |     const step = steps[firedPops];
276 |     renderer.onPop(step, now);
277 |     sound.pop(step.chain);
278 |     revealedScore += step.score;
279 |     revealedMaxChain = Math.max(revealedMaxChain, step.chain);
280 |     firedPops++;
281 |   }
```

アニメーションの経過時間を見て、「1連鎖が消える瞬間」を過ぎていたら、その瞬間の処理を1回だけ行う。
- L274: まだ処理していない連鎖のうち、消え始めの時刻を過ぎたものを順に処理する。1フレームの間に2つ過ぎていても取りこぼさないよう `while` にしている。
- L276–280: 破片などのエフェクト、キィン音、スコアの加算（表示用）、最大連鎖の更新、処理済みの数を1つ進める。

**L282–291**

```ts
282 |   if (e >= tl.total) {
283 |     if (anim.turn.chain.allClear) {
284 |       renderer.banner('ALL CLEAR', now);
285 |       sound.allClear();
286 |     }
287 |     revealedScore = game.score;
288 |     anim = null;
289 |   }
290 | }
291 | 
```

演出が全部終わったら:
- 全消しなら「ALL CLEAR」の表示と音。
- 表示用スコアを本当の値に合わせて（念のため）、アニメーションを終える。

## 毎フレーム: 終了の処理 processEnd

**L292–308**

```ts
292 | function processEnd(now: number): void {
293 |   if (!game || endAt === null || endHandled || now < endAt) return;
294 |   endHandled = true;
295 |   const elapsed = endAt - startAt + penaltyMs;
296 |   if (game.finished === 'cleared') {
297 |     sound.clear();
298 |     renderer.banner('CLEAR!', now, 1100);
299 |     const rec: RunRecord = {
300 |       timeMs: Math.round(elapsed),
301 |       seed: game.seed,
302 |       maxChain: game.maxChain,
303 |       moves: game.moves,
304 |       undos: game.undos,
305 |       date: new Date().toISOString(),
306 |       controlScheme: options.controlScheme,
307 |     };
308 |     const res = submitRecord(target, rec);
```

終了時刻を過ぎたら一度だけ実行する。
- L293: ゲームがない、終わる予定がない、処理済み、まだ時刻前、のどれかなら何もしない。
- L295: **最終タイム** ＝ 終了時刻 − 開始時刻 ＋ ペナルティ。
- L297–298: クリアの音と「CLEAR!」表示。
- L299–308: ランキングに登録する記録を作って保存。

**L309–324**

```ts
309 |     const g = game;
310 |     window.setTimeout(() => {
311 |       if (game !== g || !g.finished) return;
312 |       showResult('cleared', elapsed, res.rank, res.prevBest?.timeMs, res.prevSeedBest?.timeMs);
313 |     }, 750);
314 |   } else {
315 |     sound.dead();
316 |     renderer.banner('窒息…', now, 1100);
317 |     const g = game;
318 |     window.setTimeout(() => {
319 |       if (game !== g || !g.finished) return;
320 |       showResult('dead', elapsed, null);
321 |     }, 750);
322 |   }
323 | }
324 | 
```

- L309–313: 0.75秒後に結果画面を出す（「CLEAR!」の演出を見せるため）。`setTimeout(関数, ミリ秒)` で、指定時間後に関数を呼ぶ。
  - L311: その0.75秒の間にリトライなどで別のゲームになっていたり、1手戻して終了状態が解除されていたりしたら、結果画面は出さない。`g` に今のゲームを控えておき、比べている。
- L314–322: 窒息した場合。記録は残さず、結果画面だけ出す。

## 毎フレーム: 画面上部の表示 updateHud

**L325–335**

```ts
325 | function updateHud(now: number, dt: number): void {
326 |   const elapsed = mode === 'menu' ? 0 : (endAt !== null && now >= endAt ? endAt : now) - startAt + penaltyMs;
327 |   ui.time.textContent = formatTime(game ? elapsed : 0);
328 |   const real = revealedScore;
329 |   shownScore += (real - shownScore) * Math.min(1, dt / 70);
330 |   if (Math.abs(real - shownScore) < 1) shownScore = real;
331 |   ui.score.textContent = fmt(Math.round(shownScore));
332 |   ui.bar.style.width = `${Math.min(100, (shownScore / target) * 100)}%`;
333 |   ui.maxchain.textContent = `${revealedMaxChain}連鎖`;
334 |   ui.moves.textContent = String(game?.moves ?? 0);
335 | 
```

- L326: 表示するタイム。終了時刻を過ぎていれば終了時刻で止め、そうでなければ現在時刻まで。どちらもペナルティを足す。
- L329: 表示スコアを、本当の値との差の一部ずつ近づける（カウントアップ演出）。`dt / 70` で、フレームの間隔に関係なく約70msで追いつく。
- L330: 差が1未満になったらぴったり合わせる。
- L332: 目標点に対する進み具合のバーの長さ（最大100%）。

**L336–349**

```ts
336 |   // 1手戻すボタン（ネクスト列の下に置く）
337 |   const inPlay = mode === 'playing' && !!game;
338 |   ui.undo.hidden = !inPlay;
339 |   if (inPlay) {
340 |     ui.undo.disabled = !canUndo();
341 |     const slot = renderer.sideSlot();
342 |     const h = ui.undo.offsetHeight;
343 |     ui.undo.style.left = `${slot.left}px`;
344 |     ui.undo.style.top = `${slot.bottom - h}px`;
345 |     ui.undo.style.width = `${slot.width}px`;
346 |   }
347 |   ui.resultUndo.hidden = !(mode === 'result' && game?.finished === 'dead' && game.canUndo());
348 | }
349 | 
```

「1手戻す」ボタンの表示。
- L337–338: プレイ中だけ表示。
- L340: 戻せないとき（演出中など）は押せない状態に。
- L341–345: canvas の上に重ねたボタンを、ネクスト列の下端に合わせて置く。canvas の大きさは画面によって変わるので、毎フレーム renderer に位置を聞いて合わせている。
- L347: 結果画面の「1手戻して続ける」ボタンは、窒息して戻せるときだけ表示。

## メインループ frame

**L350–374**

```ts
350 | let last = performance.now();
351 | function frame(now: number): void {
352 |   const dt = Math.min(50, now - last);
353 |   last = now;
354 |   keyboard.update(now);
355 |   processAnimation(now);
356 |   processEnd(now);
357 |   updateHud(now, dt);
358 |   renderer.render(
359 |     {
360 |       field: game ? game.field : emptyField,
361 |       anim,
362 |       current: game && !game.finished ? game.current() : null,
363 |       cursor,
364 |       nexts: game ? game.nexts() : [],
365 |       ghost: !!game && !game.finished,
366 |       cancelHint,
367 |     },
368 |     now,
369 |     dt,
370 |   );
371 |   if (pad.enabled) pad.update(game && !game.finished ? game.current() : null, canControl());
372 |   requestAnimationFrame(frame);
373 | }
374 | 
```

1フレームごとに呼ばれる関数。
- L352: 前のフレームからの経過時間。タブを裏に回していた後などに大きな値になると破片が吹っ飛ぶので、最大50msに抑える。
- L354–357: 長押しの移動 → 演出のきっかけ → 終了の処理 → 上部の表示、の順に更新。
- L358–370: 描画担当に「今描くもの」を渡して描いてもらう。メニュー中は飾りの盤面 `emptyField` を描く。
- L371: ボタン方式のときは、ボタンに描くペアの色と、押せるかどうかを更新する。
- L372: `requestAnimationFrame(frame)` … 「次に画面を描き替えるタイミングで、もう一度 frame を呼んで」とブラウザに頼む。これで画面のリフレッシュレート（多くは60回/秒）に合わせてループし続ける。

**L375–390**

```ts
375 | // メニュー中に盤面に飾りとして並べる宝石
376 | const emptyField = Field.fromRows([
377 |   '......',
378 |   '......',
379 |   '......',
380 |   '......',
381 |   '......',
382 |   '......',
383 |   '......',
384 |   '3.....',
385 |   '20...1',
386 |   '201.31',
387 |   '120331',
388 |   '112002',
389 | ]);
390 | 
```

メニュー画面の背景に置く飾りの盤面。`Field.fromRows` に画面の見た目どおりの文字列で書いている。
`const` は宣言より前で使うとエラーになるが、`frame()` が実際に呼ばれるのはファイルの最後（L595）より後なので問題ない。

## 画面の切り替え showOverlay

**L391–400**

```ts
391 | // ---------- オーバーレイ ----------
392 | type OverlayName = 'menu' | 'options' | 'ranking' | 'result';
393 | function showOverlay(name: OverlayName | null): void {
394 |   ui.menu.hidden = name !== 'menu';
395 |   ui.options.hidden = name !== 'options';
396 |   ui.ranking.hidden = name !== 'ranking';
397 |   ui.result.hidden = name !== 'result';
398 |   if (name === 'menu') $('start').focus();
399 | }
400 | 
```

メニュー・オプション・ランキング・結果のうち、指定したものだけを表示し、残りを隠す。`null` なら全部隠す（プレイ画面だけになる）。
HTML 要素の `hidden` を true にすると非表示になる。メニューを開いたときは、Enter ですぐ始められるようスタートボタンにフォーカスを当てる。

## 結果画面 showResult

**L401–409**

```ts
401 | function showResult(kind: 'cleared' | 'dead', elapsed: number, rank: number | null, prevBest?: number, prevSeedBest?: number): void {
402 |   if (!game) return;
403 |   mode = 'result';
404 |   const kindEl = $('result-kind');
405 |   kindEl.textContent = kind === 'cleared' ? (rank === 1 ? 'NEW RECORD' : 'CLEAR') : '窒息';
406 |   kindEl.classList.toggle('dead', kind === 'dead');
407 |   $('result-time').textContent = formatTime(elapsed);
408 |   const delta = $('result-delta');
409 |   delta.className = 'result-delta';
```

- 引数: 種類（クリア／窒息）、タイム、順位、これまでのベスト、このシードでのベスト。最後の2つは `?` 付きで省略可能。
- L405: 見出し。1位なら「NEW RECORD」。
- L406: `classList.toggle('dead', 条件)` … 条件が真ならクラスを付け、偽なら外す。窒息なら赤い見出しにする。
- L409: 差分表示のクラスをいったんリセット。

**L410–429**

```ts
410 |   if (kind === 'cleared') {
411 |     const parts: string[] = [];
412 |     if (prevBest !== undefined) {
413 |       const d = elapsed - prevBest;
414 |       parts.push(`ベスト ${d <= 0 ? '−' : '+'}${formatTime(Math.abs(d))}`);
415 |       delta.classList.add(d <= 0 ? 'better' : 'worse');
416 |     } else {
417 |       parts.push('初記録');
418 |       delta.classList.add('better');
419 |     }
420 |     if (prevSeedBest !== undefined) {
421 |       const d = elapsed - prevSeedBest;
422 |       parts.push(`このシード ${d <= 0 ? '−' : '+'}${formatTime(Math.abs(d))}`);
423 |     }
424 |     if (rank) parts.push(`${rank}位`);
425 |     delta.textContent = parts.join('　');
426 |   } else {
427 |     delta.textContent = game.canUndo() ? `1手戻すと +${CONFIG.UNDO_PENALTY_MS / 1000}秒で続行できます` : '記録なし';
428 |     delta.classList.add('worse');
429 |   }
```

- クリアの場合: ベストとの差を「ベスト −0:01.23」の形で作る。速ければ（差が0以下）緑、遅ければ赤。初めての記録なら「初記録」。シード別ベストとの差、順位も並べて、全角スペースでつなぐ。
- 窒息の場合: 1手戻せるなら「1手戻すと +5秒で続行できます」と案内する。

**L430–439**

```ts
430 |   $('result-target').textContent = fmt(target);
431 |   $('result-score').textContent = fmt(game.score);
432 |   $('result-seed').textContent = String(game.seed);
433 |   $('result-chain').textContent = `${game.maxChain}連鎖`;
434 |   $('result-moves').textContent = String(game.moves);
435 |   $('result-undos').textContent = String(game.undos);
436 |   showOverlay('result');
437 |   $('retry').focus();
438 | }
439 | 
```

目標点・スコア・シード・最大連鎖・手数・戻した回数を表示して、結果画面を開く。Enter ですぐリトライできるようリトライボタンにフォーカス。

## メニューの組み立て

**L440–457**

```ts
440 | // ---------- メニューの組み立て ----------
441 | function renderTargets(): void {
442 |   ui.targets.replaceChildren(
443 |     ...CONFIG.TARGETS.map((t) => {
444 |       const b = document.createElement('button');
445 |       b.type = 'button';
446 |       b.className = 'seg-btn';
447 |       b.textContent = targetLabel(t);
448 |       b.setAttribute('aria-pressed', String(t === target));
449 |       b.addEventListener('click', () => {
450 |         target = t;
451 |         renderTargets();
452 |       });
453 |       return b;
454 |     }),
455 |   );
456 | }
457 | 
```

`renderTargets()` … 目標点のボタンを作り直す。
- `replaceChildren(...)` … 中身を丸ごと入れ替える。`...配列` で配列の要素を引数として並べて渡す。
- 各目標点についてボタンを作り（`document.createElement('button')`）、選ばれているものには `aria-pressed="true"` を付ける。CSS はこの属性を見て金色の「選択中」の見た目にする。`aria-pressed` は読み上げソフトにも「押されている」と伝わる。
- クリックされたら、その目標点を選んで作り直す。

**L458–465**

```ts
458 | function setSeedMode(m: 'random' | 'fixed'): void {
459 |   seedMode = m;
460 |   ui.seedRandom.setAttribute('aria-pressed', String(m === 'random'));
461 |   ui.seedFixed.setAttribute('aria-pressed', String(m === 'fixed'));
462 |   ui.seedInput.disabled = m === 'random';
463 |   if (m === 'fixed') ui.seedInput.focus();
464 | }
465 | 
```

`setSeedMode(m)` … シードの選び方を切り替える。ランダムなら番号の入力欄を無効にし、番号指定なら入力欄にカーソルを移す。

**L466–483**

```ts
466 | function renderHowto(): void {
467 |   const arrow =
468 |     '<b>キーボード</b>　<kbd>←</kbd><kbd>→</kbd> 移動　<kbd>Z</kbd><kbd>X</kbd> 回転　<kbd>↓</kbd>/<kbd>↑</kbd> 設置';
469 |   const direct =
470 |     '<b>キーボード</b>　<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> 子ぷよの向き　<kbd>H</kbd><kbd>J</kbd><kbd>K</kbd><kbd>L</kbd><kbd>;</kbd><kbd>\'</kbd> その列に設置';
471 |   const touch = {
472 |     single:
473 |       '<b>タッチ</b>　列をタップで縦置き、フリックで子ぷよの向き。盤面の外まで引っぱるか2本目の指でタップすると取り消し（マウスは右クリック）',
474 |     twohand:
475 |       '<b>タッチ（両手）</b>　左半分を横にスワイプで列、右半分をフリックで子ぷよの向き。右を離すと設置、左を先に離すと取り消し（左は押したままでよい）',
476 |     buttons: '<b>タッチ（ボタン）</b>　盤面の下のボタンで置き方を選び、離すと設置。ボタンの外までずらして離すと取り消し',
477 |   }[options.touchScheme];
478 |   const common = `${touch}<br><kbd>Q</kbd> 1手戻す(+5秒)　<kbd>R</kbd> リトライ　<kbd>N</kbd> 新しいシード　<kbd>Esc</kbd> メニュー`;
479 |   const key = options.controlScheme === 'arrow' ? arrow : direct;
480 |   ui.howto.innerHTML = `${key}<br>${common}`;
481 |   ui.keyhelp.innerHTML = `${key.replace('<b>キーボード</b>　', '')}<br><kbd>Q</kbd>/<kbd>BS</kbd> 1手戻す(+5秒)<br><kbd>R</kbd> リトライ　<kbd>N</kbd> 新シード<br><kbd>Esc</kbd> メニュー`;
482 | }
483 | 
```

`renderHowto()` … 遊び方の説明文を、今の操作方式に合わせて作る。メニュー画面用（`howto`）と、PCのプレイ画面右側用（`keyhelp`）の2か所。`<kbd>` はキーボードのキーを表す HTML の要素で、CSS でキーっぽい見た目にしている。
- L471–477: タッチの説明は、片手・両手・ボタンの3方式から選ぶ。`{ single: …, twohand: …, buttons: … }[options.touchScheme]` は、オブジェクトを作ってすぐに今の方式の名前で取り出す書き方。

## オプションの反映 applyOptions

**L484–519**

```ts
484 | function applyOptions(): void {
485 |   keyboard.scheme = options.controlScheme;
486 |   pointer.threshold = options.flickThreshold;
487 |   pointer.enabled = options.touchScheme === 'single';
488 |   twoHand.enabled = options.touchScheme === 'twohand';
489 |   twoHand.threshold = options.flickThreshold;
490 |   twoHand.columnStep = options.columnStep;
491 |   pad.enabled = options.touchScheme === 'buttons';
492 |   $('pad').hidden = !pad.enabled;
493 |   sound.setVolume(options.sfxVolume);
494 |   for (const b of $('opt-scheme').querySelectorAll<HTMLButtonElement>('.seg-btn')) {
495 |     b.setAttribute('aria-pressed', String(b.dataset.value === options.controlScheme));
496 |   }
497 |   for (const b of $('opt-spawn-col').querySelectorAll<HTMLButtonElement>('.seg-btn')) {
498 |     b.setAttribute('aria-pressed', String(b.dataset.value === options.spawnCol));
499 |   }
500 |   for (const b of $('opt-spawn-rot').querySelectorAll<HTMLButtonElement>('.seg-btn')) {
501 |     b.setAttribute('aria-pressed', String(b.dataset.value === options.spawnRot));
502 |   }
503 |   for (const b of $('opt-touch').querySelectorAll<HTMLButtonElement>('.seg-btn')) {
504 |     b.setAttribute('aria-pressed', String(b.dataset.value === options.touchScheme));
505 |   }
506 |   const step = $<HTMLInputElement>('opt-step');
507 |   step.value = String(options.columnStep);
508 |   $('opt-step-out').textContent = `${options.columnStep}px`;
509 |   $('opt-step-group').hidden = options.touchScheme !== 'twohand';
510 |   const flick = $<HTMLInputElement>('opt-flick');
511 |   flick.value = String(options.flickThreshold);
512 |   $('opt-flick-out').textContent = `${options.flickThreshold}px`;
513 |   const vol = $<HTMLInputElement>('opt-volume');
514 |   vol.value = String(options.sfxVolume);
515 |   $('opt-volume-out').textContent = `${Math.round(options.sfxVolume * 100)}%`;
516 |   renderHowto();
517 |   saveOptions(options);
518 | }
519 | 
```

オプションが変わるたびに呼ぶ。
- L485–493: 入力・音に設定を反映。タッチは片手（`pointer`）・両手（`twoHand`）・ボタン（`pad`）のどれか1つだけを `enabled` にする。ボタン方式のときだけ、盤面の下のボタン（`#pad`）を表示する。
- L494–505: 操作方式・次のペアの列・子ぷよの向き・タッチ操作のボタンの選択状態を更新。`querySelectorAll('.seg-btn')` でその中のボタンを全部取り、`data-value` 属性（HTML の `data-value="arrow"`。JavaScript からは `dataset.value`）と比べる。
- L506–515: スライダーの位置と、横の数値表示を更新。「1列動かす距離」のスライダーは両手モードのときだけ表示する（`hidden`）。
- L516–517: 説明文を作り直して、設定を保存。

## ランキング画面 renderRanking

**L520–536**

```ts
520 | function renderRanking(): void {
521 |   ui.rankTabs.replaceChildren(
522 |     ...CONFIG.TARGETS.map((t) => {
523 |       const b = document.createElement('button');
524 |       b.type = 'button';
525 |       b.className = 'seg-btn';
526 |       b.textContent = targetLabel(t);
527 |       b.setAttribute('aria-pressed', String(t === rankTarget));
528 |       b.addEventListener('click', () => {
529 |         rankTarget = t;
530 |         renderRanking();
531 |       });
532 |       return b;
533 |     }),
534 |   );
535 |   ui.rankNote.hidden = configSignature() === 'default';
536 |   const list = getRanking(rankTarget);
```

- L521–534: 目標点のタブを作る（目標点ボタンと同じ作り方）。
- L535: 設定定数を変えているなら「別枠の記録です」という注意を出す。
- L536: その目標点の記録を読み込む。

**L537–564**

```ts
537 |   if (list.length === 0) {
538 |     ui.rankBody.innerHTML = '<tr><td class="empty" colspan="7">まだ記録がありません。最初の1本を走ろう。</td></tr>';
539 |     return;
540 |   }
541 |   ui.rankBody.replaceChildren(
542 |     ...list.map((r, i) => {
543 |       const tr = document.createElement('tr');
544 |       if (i === 0) tr.className = 'top';
545 |       const d = new Date(r.date);
546 |       const cells = [
547 |         String(i + 1),
548 |         formatTime(r.timeMs),
549 |         String(r.seed),
550 |         `${r.maxChain}`,
551 |         String(r.moves),
552 |         String(r.undos ?? 0),
553 |         `${d.getMonth() + 1}/${d.getDate()}`,
554 |       ];
555 |       for (const c of cells) {
556 |         const td = document.createElement('td');
557 |         td.textContent = c;
558 |         tr.append(td);
559 |       }
560 |       return tr;
561 |     }),
562 |   );
563 | }
564 | 
```

- L537–540: 記録がなければ「まだ記録がありません」の行だけ出す。`innerHTML` は HTML の文字列で中身を書き換える。
- L541–562: 記録1件ごとに表の行（`tr`）を作る。1位の行には `top` クラスを付けて金色にする。
- L545: 保存していた日時の文字列から日付を作る。
- L546–554: 各列の文字。`r.undos ?? 0` は、1手戻す機能を入れる前の記録（`undos` がない）なら0と表示。`getMonth()` は0始まり（1月が0）なので1を足す。
- L555–559: セル（`td`）を作って行に追加。`textContent` で入れると、文字列が HTML として解釈されないので安全。

## ボタンなどのイベント

**L565–582**

```ts
565 | // ---------- イベント ----------
566 | ui.seedRandom.addEventListener('click', () => setSeedMode('random'));
567 | ui.seedFixed.addEventListener('click', () => setSeedMode('fixed'));
568 | $('start').addEventListener('click', () => startGame(chosenSeed()));
569 | $('open-options').addEventListener('click', () => showOverlay('options'));
570 | $('close-options').addEventListener('click', () => showOverlay('menu'));
571 | $('open-ranking').addEventListener('click', () => {
572 |   rankTarget = target;
573 |   renderRanking();
574 |   showOverlay('ranking');
575 | });
576 | $('close-ranking').addEventListener('click', () => showOverlay('menu'));
577 | $('retry').addEventListener('click', () => handlers.retry());
578 | $('new-seed').addEventListener('click', () => handlers.newSeed());
579 | $('to-menu').addEventListener('click', goMenu);
580 | ui.undo.addEventListener('click', undo);
581 | ui.resultUndo.addEventListener('click', undo);
582 | 
```

各ボタンが押されたときの処理を登録する。`addEventListener('click', 関数)`。

**L583–600**

```ts
583 | for (const b of $('opt-scheme').querySelectorAll<HTMLButtonElement>('.seg-btn')) {
584 |   b.addEventListener('click', () => {
585 |     options = { ...options, controlScheme: b.dataset.value as Options['controlScheme'] };
586 |     applyOptions();
587 |   });
588 | }
589 | for (const b of $('opt-spawn-col').querySelectorAll<HTMLButtonElement>('.seg-btn')) {
590 |   b.addEventListener('click', () => {
591 |     options = { ...options, spawnCol: b.dataset.value as Options['spawnCol'] };
592 |     applyOptions();
593 |   });
594 | }
595 | for (const b of $('opt-spawn-rot').querySelectorAll<HTMLButtonElement>('.seg-btn')) {
596 |   b.addEventListener('click', () => {
597 |     options = { ...options, spawnRot: b.dataset.value as Options['spawnRot'] };
598 |     applyOptions();
599 |   });
600 | }
```

オプションの操作方式・次のペアの列・子ぷよの向きのボタン。押されたら、そのボタンの値で設定を更新して反映する。


**L601–610**

```ts
601 | for (const b of $('opt-touch').querySelectorAll<HTMLButtonElement>('.seg-btn')) {
602 |   b.addEventListener('click', () => {
603 |     options = { ...options, touchScheme: b.dataset.value as Options['touchScheme'] };
604 |     applyOptions();
605 |   });
606 | }
607 | $<HTMLInputElement>('opt-step').addEventListener('input', (e) => {
608 |   options = { ...options, columnStep: Number((e.target as HTMLInputElement).value) };
609 |   applyOptions();
610 | });
```

タッチ操作（片手／両手）のボタンと、両手モードで1列動かす距離のスライダー。作り方は上と同じ。

**L611–620**

```ts
611 | $<HTMLInputElement>('opt-flick').addEventListener('input', (e) => {
612 |   options = { ...options, flickThreshold: Number((e.target as HTMLInputElement).value) };
613 |   applyOptions();
614 | });
615 | $<HTMLInputElement>('opt-volume').addEventListener('input', (e) => {
616 |   options = { ...options, sfxVolume: Number((e.target as HTMLInputElement).value) };
617 |   applyOptions();
618 |   sound.unlock();
619 |   sound.pop(3);
620 | });
```

スライダー。`input` イベントは、つまみを動かしている最中にも何度も届く。
音量スライダーは、動かすたびにキィン音を鳴らして音量を確かめられるようにしている。

## 記録の全削除（2回押し）

**L621–636**

```ts
621 | const clearBtn = $<HTMLButtonElement>('clear-records');
622 | clearBtn.addEventListener('click', () => {
623 |   if (clearBtn.dataset.armed === 'true') {
624 |     clearRecords();
625 |     clearBtn.dataset.armed = 'false';
626 |     clearBtn.textContent = '削除しました';
627 |     return;
628 |   }
629 |   clearBtn.dataset.armed = 'true';
630 |   clearBtn.textContent = 'もう一度押すと削除';
631 |   window.setTimeout(() => {
632 |     clearBtn.dataset.armed = 'false';
633 |     clearBtn.textContent = '記録をすべて削除';
634 |   }, 3000);
635 | });
636 | 
```

うっかり消さないよう、1回目は「もう一度押すと削除」に変わるだけ。3秒以内にもう一度押すと削除する。
`dataset.armed` は HTML の `data-armed` 属性。押せる状態かどうかを要素自体に覚えさせ、CSS でも見た目を変えている。

**L637–638**

```ts
637 | new ResizeObserver(() => renderer.resize()).observe($('stage'));
638 | 
```

`ResizeObserver` … 指定した要素の大きさが変わったら知らせてくれる仕組み。盤面のエリアの大きさが変わるたびにレイアウトを計算し直す。

## オフライン対応（PWA）

一度ページを開くと、ブラウザが **Service Worker**（ページとは別に裏で動く小さなプログラム）を登録し、ゲームに必要なファイルを端末に保存する。次からはネットにつながっていなくても、保存したファイルで遊べる。Service Worker 本体（`sw.js`）はビルドの道具（vite-plugin-pwa）が自動で作る。設定は `vite.config.ts`。

**L639–652**

```ts
639 | // ---------- オフライン対応（PWA） ----------
640 | // 新しい版が届いても、遊んでいる途中では切り替えない。メニュー画面に戻ったときに再読み込みして切り替える
641 | let updateReady = false;
642 | const updateSW = registerSW({
643 |   onNeedRefresh() {
644 |     updateReady = true;
645 |     applyUpdateIfIdle();
646 |   },
647 | });
648 | 
649 | function applyUpdateIfIdle(): void {
650 |   if (updateReady && mode === 'menu') void updateSW(true);
651 | }
652 | 
```

- L642–647: `registerSW` で Service Worker を登録する。新しい版（ゲームを更新して公開し直したもの）が見つかると `onNeedRefresh` が呼ばれる。
- L641, L644: 新しい版が届いたことを覚えておく。
- L649–651: `applyUpdateIfIdle()` … メニュー画面にいるときだけ、新しい版に切り替える。`updateSW(true)` は新しい Service Worker を有効にしてページを再読み込みする。遊んでいる途中に再読み込みされるとタイムも盤面も消えてしまうので、プレイ中は待って、メニューに戻ったとき（`goMenu`）に切り替える。
- `void` … 「戻り値（Promise）は待たない」ことをはっきり書くための印。

## 起動

**L653–657**

```ts
653 | // ---------- 起動 ----------
654 | renderTargets();
655 | applyOptions();
656 | showOverlay('menu');
657 | requestAnimationFrame(frame);
```

ページを開いたときに1回だけ実行される部分。目標点のボタンを作り、オプションを反映し、メニューを開き、メインループを始める。
