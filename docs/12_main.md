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
  7 | import { Keyboard, Pointer, type ControlHandlers } from './input/controls';
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

**L171–179**

```ts
171 |   firedPops = 0;
172 |   busyUntil = now + turn.timeline.total;
173 |   if (turn.cleared || turn.dead) endAt = busyUntil;
174 |   sound.place();
175 | 
176 |   if (options.spawnMode === 'reset') cursor = { x: 2, rot: 0 };
177 |   else cursor = { x: clampPlacement(x, rot), rot };
178 | }
179 | 
```

- L172: 演出が終わる時刻まで操作を止める。
- L173: この手でクリアか窒息したなら、終了時刻は演出が終わる瞬間。**タイムは最後の連鎖が終わった瞬間で確定**、という仕様はここで決まる。
- L176–177: 次のペアの開始位置。リセットなら3列目・子が上、引き継ぎなら今置いた位置と向き。

## 入力に渡す操作の一覧 handlers

**L180–193**

```ts
180 | const handlers: ControlHandlers = {
181 |   canControl,
182 |   move(dx) {
183 |     const min = cursor.rot === 3 ? 1 : 0;
184 |     const max = cursor.rot === 1 ? 4 : 5;
185 |     const nx = cursor.x + dx;
186 |     if (nx < min || nx > max) return false;
187 |     cursor = { ...cursor, x: nx };
188 |     sound.move();
189 |     return true;
190 |   },
191 |   moveToWall(dx) {
192 |     while (handlers.move(dx));
193 |   },
```

`controls.ts` の `ControlHandlers` の形どおりに、実際の処理を書いたオブジェクト。`canControl,` は `canControl: canControl` の省略形。
- `move(dx)` … カーソルを左右に動かす。向きによって動ける範囲が違う（子が左なら1列目より左には行けない、子が右なら5列目まで）。動けたら移動音を鳴らして true。
- `moveToWall(dx)` … 動けなくなるまで `move` をくり返す。`while (条件);` は中身のない while で、条件の関数を呼ぶこと自体が処理になっている。

**L194–208**

```ts
194 |   rotate(dir) {
195 |     const rot = ((cursor.rot + dir + 4) % 4) as Rotation;
196 |     cursor = { x: clampPlacement(cursor.x, rot), rot };
197 |     sound.rotate();
198 |   },
199 |   setRotation(rot) {
200 |     cursor = { x: clampPlacement(cursor.x, rot), rot };
201 |   },
202 |   place() {
203 |     placeAt(cursor.x, cursor.rot);
204 |   },
205 |   placeAt(col) {
206 |     cursor = { ...cursor, x: col };
207 |     placeAt(col, cursor.rot);
208 |   },
```

- `rotate(dir)` … 向きを回す。`+ 4` してから `% 4` するのは、左回転で -1 になったときに `3` に戻すため（`-1 % 4` は JavaScript では `-1` になってしまう）。回した後に壁からはみ出すなら `clampPlacement` で内側にずらす（壁蹴り）。
- `setRotation(rot)` … 向きを直接指定（直接指定方式）。
- `place()` … 今のカーソル位置に置く。
- `placeAt(col)` … 指定した列に置く（直接指定方式の HJKL;'）。

**L209–220**

```ts
209 |   preview(col, rot, outside) {
210 |     cursor = { x: col, rot };
211 |     cancelHint = outside;
212 |   },
213 |   cancelled() {
214 |     cancelHint = false;
215 |     sound.cancel();
216 |   },
217 |   pointerPlace(col, rot) {
218 |     placeAt(col, rot);
219 |   },
220 |   undo,
```

- `preview` … タッチ中、カーソルを指の位置と向きに合わせ、キャンセル表示のオンオフを覚える。
- `cancelled` … キャンセル音を鳴らす。
- `pointerPlace` … タッチで置く。
- `undo,` … 上で定義した `undo` 関数をそのまま渡す。

**L221–242**

```ts
221 |   retry() {
222 |     if (mode === 'menu' || !game) return;
223 |     startGame(game.seed);
224 |   },
225 |   newSeed() {
226 |     if (mode === 'menu') return;
227 |     startGame(randomSeed());
228 |   },
229 |   menu() {
230 |     // オプション・ランキングはメニューから開くので、閉じてメニューに戻る
231 |     if (!ui.options.hidden || !ui.ranking.hidden) {
232 |       showOverlay('menu');
233 |       return;
234 |     }
235 |     goMenu();
236 |   },
237 |   start() {
238 |     if (mode === 'menu' && ui.options.hidden && ui.ranking.hidden) startGame(chosenSeed());
239 |     else if (mode === 'result') startGame(game ? game.seed : chosenSeed());
240 |   },
241 | };
242 | 
```

- `retry` … 同じシードで最初から。メニュー中は何もしない。
- `newSeed` … ランダムな新しいシードで最初から。
- `menu`（Esc）… オプションやランキングを開いていればメニューに戻るだけ。そうでなければ（プレイ中・結果画面）メニューへ。
- `start`（Enter / Space）… メニュー画面ならゲーム開始。結果画面なら同じシードでもう一度。

**L243–250**

```ts
243 | const keyboard = new Keyboard(handlers);
244 | const pointer = new Pointer(
245 |   canvas,
246 |   (x, y) => renderer.columnAt(x, y),
247 |   (x, y) => renderer.isOutside(x, y),
248 |   handlers,
249 | );
250 | 
```

キーボードとタッチの入力を作る。タッチには、列を求める関数と盤面外を判定する関数を renderer から渡す（`(x, y) => renderer.columnAt(x, y)` のように包んで渡す）。

**L251–258**

```ts
251 | function goMenu(): void {
252 |   mode = 'menu';
253 |   game = null;
254 |   anim = null;
255 |   renderer.clearEffects();
256 |   showOverlay('menu');
257 | }
258 | 
```

`goMenu()` … メニューに戻る。ゲームを捨てて、エフェクトも消す。

## 毎フレーム: 演出のきっかけ processAnimation

**L259–272**

```ts
259 | // ---------- 1フレームごとの処理 ----------
260 | function processAnimation(now: number): void {
261 |   if (!anim || !game) return;
262 |   const e = now - anim.start;
263 |   const steps = anim.turn.chain.steps;
264 |   const tl = anim.turn.timeline;
265 |   while (firedPops < steps.length && e >= tl.steps[firedPops].popStart) {
266 |     const step = steps[firedPops];
267 |     renderer.onPop(step, now);
268 |     sound.pop(step.chain);
269 |     revealedScore += step.score;
270 |     revealedMaxChain = Math.max(revealedMaxChain, step.chain);
271 |     firedPops++;
272 |   }
```

アニメーションの経過時間を見て、「1連鎖が消える瞬間」を過ぎていたら、その瞬間の処理を1回だけ行う。
- L265: まだ処理していない連鎖のうち、消え始めの時刻を過ぎたものを順に処理する。1フレームの間に2つ過ぎていても取りこぼさないよう `while` にしている。
- L267–271: 破片などのエフェクト、キィン音、スコアの加算（表示用）、最大連鎖の更新、処理済みの数を1つ進める。

**L273–282**

```ts
273 |   if (e >= tl.total) {
274 |     if (anim.turn.chain.allClear) {
275 |       renderer.banner('ALL CLEAR', now);
276 |       sound.allClear();
277 |     }
278 |     revealedScore = game.score;
279 |     anim = null;
280 |   }
281 | }
282 | 
```

演出が全部終わったら:
- 全消しなら「ALL CLEAR」の表示と音。
- 表示用スコアを本当の値に合わせて（念のため）、アニメーションを終える。

## 毎フレーム: 終了の処理 processEnd

**L283–299**

```ts
283 | function processEnd(now: number): void {
284 |   if (!game || endAt === null || endHandled || now < endAt) return;
285 |   endHandled = true;
286 |   const elapsed = endAt - startAt + penaltyMs;
287 |   if (game.finished === 'cleared') {
288 |     sound.clear();
289 |     renderer.banner('CLEAR!', now, 1100);
290 |     const rec: RunRecord = {
291 |       timeMs: Math.round(elapsed),
292 |       seed: game.seed,
293 |       maxChain: game.maxChain,
294 |       moves: game.moves,
295 |       undos: game.undos,
296 |       date: new Date().toISOString(),
297 |       controlScheme: options.controlScheme,
298 |     };
299 |     const res = submitRecord(target, rec);
```

終了時刻を過ぎたら一度だけ実行する。
- L284: ゲームがない、終わる予定がない、処理済み、まだ時刻前、のどれかなら何もしない。
- L286: **最終タイム** ＝ 終了時刻 − 開始時刻 ＋ ペナルティ。
- L288–289: クリアの音と「CLEAR!」表示。
- L290–299: ランキングに登録する記録を作って保存。

**L300–315**

```ts
300 |     const g = game;
301 |     window.setTimeout(() => {
302 |       if (game !== g || !g.finished) return;
303 |       showResult('cleared', elapsed, res.rank, res.prevBest?.timeMs, res.prevSeedBest?.timeMs);
304 |     }, 750);
305 |   } else {
306 |     sound.dead();
307 |     renderer.banner('窒息…', now, 1100);
308 |     const g = game;
309 |     window.setTimeout(() => {
310 |       if (game !== g || !g.finished) return;
311 |       showResult('dead', elapsed, null);
312 |     }, 750);
313 |   }
314 | }
315 | 
```

- L300–304: 0.75秒後に結果画面を出す（「CLEAR!」の演出を見せるため）。`setTimeout(関数, ミリ秒)` で、指定時間後に関数を呼ぶ。
  - L302: その0.75秒の間にリトライなどで別のゲームになっていたり、1手戻して終了状態が解除されていたりしたら、結果画面は出さない。`g` に今のゲームを控えておき、比べている。
- L305–313: 窒息した場合。記録は残さず、結果画面だけ出す。

## 毎フレーム: 画面上部の表示 updateHud

**L316–326**

```ts
316 | function updateHud(now: number, dt: number): void {
317 |   const elapsed = mode === 'menu' ? 0 : (endAt !== null && now >= endAt ? endAt : now) - startAt + penaltyMs;
318 |   ui.time.textContent = formatTime(game ? elapsed : 0);
319 |   const real = revealedScore;
320 |   shownScore += (real - shownScore) * Math.min(1, dt / 70);
321 |   if (Math.abs(real - shownScore) < 1) shownScore = real;
322 |   ui.score.textContent = fmt(Math.round(shownScore));
323 |   ui.bar.style.width = `${Math.min(100, (shownScore / target) * 100)}%`;
324 |   ui.maxchain.textContent = `${revealedMaxChain}連鎖`;
325 |   ui.moves.textContent = String(game?.moves ?? 0);
326 | 
```

- L317: 表示するタイム。終了時刻を過ぎていれば終了時刻で止め、そうでなければ現在時刻まで。どちらもペナルティを足す。
- L320: 表示スコアを、本当の値との差の一部ずつ近づける（カウントアップ演出）。`dt / 70` で、フレームの間隔に関係なく約70msで追いつく。
- L321: 差が1未満になったらぴったり合わせる。
- L323: 目標点に対する進み具合のバーの長さ（最大100%）。

**L327–340**

```ts
327 |   // 1手戻すボタン（ネクスト列の下に置く）
328 |   const inPlay = mode === 'playing' && !!game;
329 |   ui.undo.hidden = !inPlay;
330 |   if (inPlay) {
331 |     ui.undo.disabled = !canUndo();
332 |     const slot = renderer.sideSlot();
333 |     const h = ui.undo.offsetHeight;
334 |     ui.undo.style.left = `${slot.left}px`;
335 |     ui.undo.style.top = `${slot.bottom - h}px`;
336 |     ui.undo.style.width = `${slot.width}px`;
337 |   }
338 |   ui.resultUndo.hidden = !(mode === 'result' && game?.finished === 'dead' && game.canUndo());
339 | }
340 | 
```

「1手戻す」ボタンの表示。
- L328–329: プレイ中だけ表示。
- L331: 戻せないとき（演出中など）は押せない状態に。
- L332–336: canvas の上に重ねたボタンを、ネクスト列の下端に合わせて置く。canvas の大きさは画面によって変わるので、毎フレーム renderer に位置を聞いて合わせている。
- L338: 結果画面の「1手戻して続ける」ボタンは、窒息して戻せるときだけ表示。

## メインループ frame

**L341–364**

```ts
341 | let last = performance.now();
342 | function frame(now: number): void {
343 |   const dt = Math.min(50, now - last);
344 |   last = now;
345 |   keyboard.update(now);
346 |   processAnimation(now);
347 |   processEnd(now);
348 |   updateHud(now, dt);
349 |   renderer.render(
350 |     {
351 |       field: game ? game.field : emptyField,
352 |       anim,
353 |       current: game && !game.finished ? game.current() : null,
354 |       cursor,
355 |       nexts: game ? game.nexts() : [],
356 |       ghost: !!game && !game.finished,
357 |       cancelHint,
358 |     },
359 |     now,
360 |     dt,
361 |   );
362 |   requestAnimationFrame(frame);
363 | }
364 | 
```

1フレームごとに呼ばれる関数。
- L343: 前のフレームからの経過時間。タブを裏に回していた後などに大きな値になると破片が吹っ飛ぶので、最大50msに抑える。
- L345–348: 長押しの移動 → 演出のきっかけ → 終了の処理 → 上部の表示、の順に更新。
- L349–361: 描画担当に「今描くもの」を渡して描いてもらう。メニュー中は飾りの盤面 `emptyField` を描く。
- L362: `requestAnimationFrame(frame)` … 「次に画面を描き替えるタイミングで、もう一度 frame を呼んで」とブラウザに頼む。これで画面のリフレッシュレート（多くは60回/秒）に合わせてループし続ける。

**L365–380**

```ts
365 | // メニュー中に盤面に飾りとして並べる宝石
366 | const emptyField = Field.fromRows([
367 |   '......',
368 |   '......',
369 |   '......',
370 |   '......',
371 |   '......',
372 |   '......',
373 |   '......',
374 |   '3.....',
375 |   '20...1',
376 |   '201.31',
377 |   '120331',
378 |   '112002',
379 | ]);
380 | 
```

メニュー画面の背景に置く飾りの盤面。`Field.fromRows` に画面の見た目どおりの文字列で書いている。
`const` は宣言より前で使うとエラーになるが、`frame()` が実際に呼ばれるのはファイルの最後（L595）より後なので問題ない。

## 画面の切り替え showOverlay

**L381–390**

```ts
381 | // ---------- オーバーレイ ----------
382 | type OverlayName = 'menu' | 'options' | 'ranking' | 'result';
383 | function showOverlay(name: OverlayName | null): void {
384 |   ui.menu.hidden = name !== 'menu';
385 |   ui.options.hidden = name !== 'options';
386 |   ui.ranking.hidden = name !== 'ranking';
387 |   ui.result.hidden = name !== 'result';
388 |   if (name === 'menu') $('start').focus();
389 | }
390 | 
```

メニュー・オプション・ランキング・結果のうち、指定したものだけを表示し、残りを隠す。`null` なら全部隠す（プレイ画面だけになる）。
HTML 要素の `hidden` を true にすると非表示になる。メニューを開いたときは、Enter ですぐ始められるようスタートボタンにフォーカスを当てる。

## 結果画面 showResult

**L391–399**

```ts
391 | function showResult(kind: 'cleared' | 'dead', elapsed: number, rank: number | null, prevBest?: number, prevSeedBest?: number): void {
392 |   if (!game) return;
393 |   mode = 'result';
394 |   const kindEl = $('result-kind');
395 |   kindEl.textContent = kind === 'cleared' ? (rank === 1 ? 'NEW RECORD' : 'CLEAR') : '窒息';
396 |   kindEl.classList.toggle('dead', kind === 'dead');
397 |   $('result-time').textContent = formatTime(elapsed);
398 |   const delta = $('result-delta');
399 |   delta.className = 'result-delta';
```

- 引数: 種類（クリア／窒息）、タイム、順位、これまでのベスト、このシードでのベスト。最後の2つは `?` 付きで省略可能。
- L395: 見出し。1位なら「NEW RECORD」。
- L396: `classList.toggle('dead', 条件)` … 条件が真ならクラスを付け、偽なら外す。窒息なら赤い見出しにする。
- L399: 差分表示のクラスをいったんリセット。

**L400–419**

```ts
400 |   if (kind === 'cleared') {
401 |     const parts: string[] = [];
402 |     if (prevBest !== undefined) {
403 |       const d = elapsed - prevBest;
404 |       parts.push(`ベスト ${d <= 0 ? '−' : '+'}${formatTime(Math.abs(d))}`);
405 |       delta.classList.add(d <= 0 ? 'better' : 'worse');
406 |     } else {
407 |       parts.push('初記録');
408 |       delta.classList.add('better');
409 |     }
410 |     if (prevSeedBest !== undefined) {
411 |       const d = elapsed - prevSeedBest;
412 |       parts.push(`このシード ${d <= 0 ? '−' : '+'}${formatTime(Math.abs(d))}`);
413 |     }
414 |     if (rank) parts.push(`${rank}位`);
415 |     delta.textContent = parts.join('　');
416 |   } else {
417 |     delta.textContent = game.canUndo() ? `1手戻すと +${CONFIG.UNDO_PENALTY_MS / 1000}秒で続行できます` : '記録なし';
418 |     delta.classList.add('worse');
419 |   }
```

- クリアの場合: ベストとの差を「ベスト −0:01.23」の形で作る。速ければ（差が0以下）緑、遅ければ赤。初めての記録なら「初記録」。シード別ベストとの差、順位も並べて、全角スペースでつなぐ。
- 窒息の場合: 1手戻せるなら「1手戻すと +5秒で続行できます」と案内する。

**L420–429**

```ts
420 |   $('result-target').textContent = fmt(target);
421 |   $('result-score').textContent = fmt(game.score);
422 |   $('result-seed').textContent = String(game.seed);
423 |   $('result-chain').textContent = `${game.maxChain}連鎖`;
424 |   $('result-moves').textContent = String(game.moves);
425 |   $('result-undos').textContent = String(game.undos);
426 |   showOverlay('result');
427 |   $('retry').focus();
428 | }
429 | 
```

目標点・スコア・シード・最大連鎖・手数・戻した回数を表示して、結果画面を開く。Enter ですぐリトライできるようリトライボタンにフォーカス。

## メニューの組み立て

**L430–447**

```ts
430 | // ---------- メニューの組み立て ----------
431 | function renderTargets(): void {
432 |   ui.targets.replaceChildren(
433 |     ...CONFIG.TARGETS.map((t) => {
434 |       const b = document.createElement('button');
435 |       b.type = 'button';
436 |       b.className = 'seg-btn';
437 |       b.textContent = targetLabel(t);
438 |       b.setAttribute('aria-pressed', String(t === target));
439 |       b.addEventListener('click', () => {
440 |         target = t;
441 |         renderTargets();
442 |       });
443 |       return b;
444 |     }),
445 |   );
446 | }
447 | 
```

`renderTargets()` … 目標点のボタンを作り直す。
- `replaceChildren(...)` … 中身を丸ごと入れ替える。`...配列` で配列の要素を引数として並べて渡す。
- 各目標点についてボタンを作り（`document.createElement('button')`）、選ばれているものには `aria-pressed="true"` を付ける。CSS はこの属性を見て金色の「選択中」の見た目にする。`aria-pressed` は読み上げソフトにも「押されている」と伝わる。
- クリックされたら、その目標点を選んで作り直す。

**L448–455**

```ts
448 | function setSeedMode(m: 'random' | 'fixed'): void {
449 |   seedMode = m;
450 |   ui.seedRandom.setAttribute('aria-pressed', String(m === 'random'));
451 |   ui.seedFixed.setAttribute('aria-pressed', String(m === 'fixed'));
452 |   ui.seedInput.disabled = m === 'random';
453 |   if (m === 'fixed') ui.seedInput.focus();
454 | }
455 | 
```

`setSeedMode(m)` … シードの選び方を切り替える。ランダムなら番号の入力欄を無効にし、番号指定なら入力欄にカーソルを移す。

**L456–467**

```ts
456 | function renderHowto(): void {
457 |   const arrow =
458 |     '<b>キーボード</b>　<kbd>←</kbd><kbd>→</kbd> 移動　<kbd>Z</kbd><kbd>X</kbd> 回転　<kbd>↓</kbd>/<kbd>↑</kbd> 設置';
459 |   const direct =
460 |     '<b>キーボード</b>　<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> 子ぷよの向き　<kbd>H</kbd><kbd>J</kbd><kbd>K</kbd><kbd>L</kbd><kbd>;</kbd><kbd>\'</kbd> その列に設置';
461 |   const common =
462 |     '<b>タッチ</b>　列をタップで縦置き、フリックで子ぷよの向き。盤面の外まで引っぱるか2本目の指でタップすると取り消し（マウスは右クリック）<br><kbd>Q</kbd> 1手戻す(+5秒)　<kbd>R</kbd> リトライ　<kbd>N</kbd> 新しいシード　<kbd>Esc</kbd> メニュー';
463 |   const key = options.controlScheme === 'arrow' ? arrow : direct;
464 |   ui.howto.innerHTML = `${key}<br>${common}`;
465 |   ui.keyhelp.innerHTML = `${key.replace('<b>キーボード</b>　', '')}<br><kbd>Q</kbd>/<kbd>BS</kbd> 1手戻す(+5秒)<br><kbd>R</kbd> リトライ　<kbd>N</kbd> 新シード<br><kbd>Esc</kbd> メニュー`;
466 | }
467 | 
```

`renderHowto()` … 遊び方の説明文を、今の操作方式に合わせて作る。メニュー画面用（`howto`）と、PCのプレイ画面右側用（`keyhelp`）の2か所。`<kbd>` はキーボードのキーを表す HTML の要素で、CSS でキーっぽい見た目にしている。

## オプションの反映 applyOptions

**L468–487**

```ts
468 | function applyOptions(): void {
469 |   keyboard.scheme = options.controlScheme;
470 |   pointer.threshold = options.flickThreshold;
471 |   sound.setVolume(options.sfxVolume);
472 |   for (const b of $('opt-scheme').querySelectorAll<HTMLButtonElement>('.seg-btn')) {
473 |     b.setAttribute('aria-pressed', String(b.dataset.value === options.controlScheme));
474 |   }
475 |   for (const b of $('opt-spawn').querySelectorAll<HTMLButtonElement>('.seg-btn')) {
476 |     b.setAttribute('aria-pressed', String(b.dataset.value === options.spawnMode));
477 |   }
478 |   const flick = $<HTMLInputElement>('opt-flick');
479 |   flick.value = String(options.flickThreshold);
480 |   $('opt-flick-out').textContent = `${options.flickThreshold}px`;
481 |   const vol = $<HTMLInputElement>('opt-volume');
482 |   vol.value = String(options.sfxVolume);
483 |   $('opt-volume-out').textContent = `${Math.round(options.sfxVolume * 100)}%`;
484 |   renderHowto();
485 |   saveOptions(options);
486 | }
487 | 
```

オプションが変わるたびに呼ぶ。
- L469–471: 入力・音に設定を反映。
- L472–477: 操作方式・開始位置のボタンの選択状態を更新。`querySelectorAll('.seg-btn')` でその中のボタンを全部取り、`data-value` 属性（HTML の `data-value="arrow"`。JavaScript からは `dataset.value`）と比べる。
- L478–483: スライダーの位置と、横の数値表示を更新。
- L484–485: 説明文を作り直して、設定を保存。

## ランキング画面 renderRanking

**L488–504**

```ts
488 | function renderRanking(): void {
489 |   ui.rankTabs.replaceChildren(
490 |     ...CONFIG.TARGETS.map((t) => {
491 |       const b = document.createElement('button');
492 |       b.type = 'button';
493 |       b.className = 'seg-btn';
494 |       b.textContent = targetLabel(t);
495 |       b.setAttribute('aria-pressed', String(t === rankTarget));
496 |       b.addEventListener('click', () => {
497 |         rankTarget = t;
498 |         renderRanking();
499 |       });
500 |       return b;
501 |     }),
502 |   );
503 |   ui.rankNote.hidden = configSignature() === 'default';
504 |   const list = getRanking(rankTarget);
```

- L489–502: 目標点のタブを作る（目標点ボタンと同じ作り方）。
- L503: 設定定数を変えているなら「別枠の記録です」という注意を出す。
- L504: その目標点の記録を読み込む。

**L505–532**

```ts
505 |   if (list.length === 0) {
506 |     ui.rankBody.innerHTML = '<tr><td class="empty" colspan="7">まだ記録がありません。最初の1本を走ろう。</td></tr>';
507 |     return;
508 |   }
509 |   ui.rankBody.replaceChildren(
510 |     ...list.map((r, i) => {
511 |       const tr = document.createElement('tr');
512 |       if (i === 0) tr.className = 'top';
513 |       const d = new Date(r.date);
514 |       const cells = [
515 |         String(i + 1),
516 |         formatTime(r.timeMs),
517 |         String(r.seed),
518 |         `${r.maxChain}`,
519 |         String(r.moves),
520 |         String(r.undos ?? 0),
521 |         `${d.getMonth() + 1}/${d.getDate()}`,
522 |       ];
523 |       for (const c of cells) {
524 |         const td = document.createElement('td');
525 |         td.textContent = c;
526 |         tr.append(td);
527 |       }
528 |       return tr;
529 |     }),
530 |   );
531 | }
532 | 
```

- L505–508: 記録がなければ「まだ記録がありません」の行だけ出す。`innerHTML` は HTML の文字列で中身を書き換える。
- L509–530: 記録1件ごとに表の行（`tr`）を作る。1位の行には `top` クラスを付けて金色にする。
- L513: 保存していた日時の文字列から日付を作る。
- L514–522: 各列の文字。`r.undos ?? 0` は、1手戻す機能を入れる前の記録（`undos` がない）なら0と表示。`getMonth()` は0始まり（1月が0）なので1を足す。
- L523–527: セル（`td`）を作って行に追加。`textContent` で入れると、文字列が HTML として解釈されないので安全。

## ボタンなどのイベント

**L533–550**

```ts
533 | // ---------- イベント ----------
534 | ui.seedRandom.addEventListener('click', () => setSeedMode('random'));
535 | ui.seedFixed.addEventListener('click', () => setSeedMode('fixed'));
536 | $('start').addEventListener('click', () => startGame(chosenSeed()));
537 | $('open-options').addEventListener('click', () => showOverlay('options'));
538 | $('close-options').addEventListener('click', () => showOverlay('menu'));
539 | $('open-ranking').addEventListener('click', () => {
540 |   rankTarget = target;
541 |   renderRanking();
542 |   showOverlay('ranking');
543 | });
544 | $('close-ranking').addEventListener('click', () => showOverlay('menu'));
545 | $('retry').addEventListener('click', () => handlers.retry());
546 | $('new-seed').addEventListener('click', () => handlers.newSeed());
547 | $('to-menu').addEventListener('click', goMenu);
548 | ui.undo.addEventListener('click', undo);
549 | ui.resultUndo.addEventListener('click', undo);
550 | 
```

各ボタンが押されたときの処理を登録する。`addEventListener('click', 関数)`。

**L551–562**

```ts
551 | for (const b of $('opt-scheme').querySelectorAll<HTMLButtonElement>('.seg-btn')) {
552 |   b.addEventListener('click', () => {
553 |     options = { ...options, controlScheme: b.dataset.value as Options['controlScheme'] };
554 |     applyOptions();
555 |   });
556 | }
557 | for (const b of $('opt-spawn').querySelectorAll<HTMLButtonElement>('.seg-btn')) {
558 |   b.addEventListener('click', () => {
559 |     options = { ...options, spawnMode: b.dataset.value as Options['spawnMode'] };
560 |     applyOptions();
561 |   });
562 | }
```

オプションの操作方式・開始位置のボタン。押されたら、そのボタンの値で設定を更新して反映する。
`{ ...options, controlScheme: ... }` は「options をコピーして、controlScheme だけ変えた新しいオブジェクト」。
`as Options['controlScheme']` は「この文字列は操作方式の型だ」という指定（`dataset.value` は普通の文字列型なので）。

**L563–572**

```ts
563 | $<HTMLInputElement>('opt-flick').addEventListener('input', (e) => {
564 |   options = { ...options, flickThreshold: Number((e.target as HTMLInputElement).value) };
565 |   applyOptions();
566 | });
567 | $<HTMLInputElement>('opt-volume').addEventListener('input', (e) => {
568 |   options = { ...options, sfxVolume: Number((e.target as HTMLInputElement).value) };
569 |   applyOptions();
570 |   sound.unlock();
571 |   sound.pop(3);
572 | });
```

スライダー。`input` イベントは、つまみを動かしている最中にも何度も届く。
音量スライダーは、動かすたびにキィン音を鳴らして音量を確かめられるようにしている。

## 記録の全削除（2回押し）

**L573–588**

```ts
573 | const clearBtn = $<HTMLButtonElement>('clear-records');
574 | clearBtn.addEventListener('click', () => {
575 |   if (clearBtn.dataset.armed === 'true') {
576 |     clearRecords();
577 |     clearBtn.dataset.armed = 'false';
578 |     clearBtn.textContent = '削除しました';
579 |     return;
580 |   }
581 |   clearBtn.dataset.armed = 'true';
582 |   clearBtn.textContent = 'もう一度押すと削除';
583 |   window.setTimeout(() => {
584 |     clearBtn.dataset.armed = 'false';
585 |     clearBtn.textContent = '記録をすべて削除';
586 |   }, 3000);
587 | });
588 | 
```

うっかり消さないよう、1回目は「もう一度押すと削除」に変わるだけ。3秒以内にもう一度押すと削除する。
`dataset.armed` は HTML の `data-armed` 属性。押せる状態かどうかを要素自体に覚えさせ、CSS でも見た目を変えている。

**L589–590**

```ts
589 | new ResizeObserver(() => renderer.resize()).observe($('stage'));
590 | 
```

`ResizeObserver` … 指定した要素の大きさが変わったら知らせてくれる仕組み。盤面のエリアの大きさが変わるたびにレイアウトを計算し直す。

## 起動

**L591–595**

```ts
591 | // ---------- 起動 ----------
592 | renderTargets();
593 | applyOptions();
594 | showOverlay('menu');
595 | requestAnimationFrame(frame);
```

ページを開いたときに1回だけ実行される部分。目標点のボタンを作り、オプションを反映し、メニューを開き、メインループを始める。
