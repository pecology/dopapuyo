# tests/core.test.ts

ゲームのルール部分（`src/core/`）が正しく動くかを自動で確かめるテスト。`npm test` で実行する。テストには **Vitest** というツールを使う。

基本の形:
- `describe('名前', () => { ... })` … テストのグループ。
- `it('こうなるはず', () => { ... })` … テスト1つ。
- `expect(実際の値).toBe(期待する値)` … 一致しなければテスト失敗。`toEqual` は配列やオブジェクトの中身まで比べる。

画面や時間を使わないルール部分だけをテストできるのは、`game.ts` が時間を扱わない作りにしてあるおかげ。

**L1–8**

```ts
  1 | import { describe, expect, it } from 'vitest';
  2 | import { resolveChain } from '../src/core/chain';
  3 | import { Field, clampPlacement } from '../src/core/field';
  4 | import { Game, buildTimeline } from '../src/core/game';
  5 | import { chainBonus, colorBonus, linkBonus, stepScore } from '../src/core/scoring';
  6 | import { generateTsumo } from '../src/core/tsumo';
  7 | import { CONFIG } from '../src/config';
  8 | 
```

Vitest のテスト用関数と、テストしたい関数を読み込む。`../src/...` で1つ上のフォルダの `src` を指す。

## 得点計算

**L9–15**

```ts
  9 | describe('scoring', () => {
 10 |   it('bonus tables follow the esports (Tsu) rules', () => {
 11 |     expect([1, 2, 3, 4, 5, 19].map(chainBonus)).toEqual([0, 8, 16, 32, 64, 512]);
 12 |     expect([4, 5, 10, 11, 20].map(linkBonus)).toEqual([0, 2, 7, 10, 10]);
 13 |     expect([1, 2, 3, 4, 5].map(colorBonus)).toEqual([0, 3, 6, 12, 24]);
 14 |   });
 15 | 
```

3種類のボーナス表が仕様どおりか。`[1, 2, 3].map(chainBonus)` で、複数の入力をまとめて関数に通し、結果の配列を期待値と比べている。

**L16–19**

```ts
 16 |   it('single 4-group 1-chain scores 40 (zero bonus counts as 1)', () => {
 17 |     expect(stepScore(1, [4], 1)).toBe(40);
 18 |   });
 19 | 
```

一番小さい連鎖（1連鎖・4個・1色）はボーナス合計0だが、1として計算されて40点になるか。

**L20–27**

```ts
 20 |   it('combines chain, link and color bonuses', () => {
 21 |     expect(stepScore(2, [4], 1)).toBe(4 * 10 * 8);
 22 |     expect(stepScore(1, [5], 1)).toBe(5 * 10 * 2);
 23 |     expect(stepScore(1, [4, 4], 2)).toBe(8 * 10 * 3);
 24 |     expect(stepScore(3, [4, 6], 2)).toBe(10 * 10 * (16 + 0 + 3 + 3));
 25 |   });
 26 | });
 27 | 
```

ボーナスの組み合わせ。2連鎖、5個つながり、2色同時消し、3連鎖で4個と6個の2色同時消し。期待値は計算式をそのまま書いて、何を確かめているかわかるようにしている。

## 盤面への設置

**L28–30**

```ts
 28 | describe('field placement', () => {
 29 |   const pair = { axis: 0, child: 1 };
 30 | 
```

このグループで使うペア（軸が色0、子が色1）。

**L31–37**

```ts
 31 |   it('clamps horizontal placements inside the walls', () => {
 32 |     expect(clampPlacement(5, 1)).toBe(4);
 33 |     expect(clampPlacement(0, 3)).toBe(1);
 34 |     expect(clampPlacement(0, 0)).toBe(0);
 35 |     expect(clampPlacement(5, 2)).toBe(5);
 36 |   });
 37 | 
```

はみ出し補正。6列目で子が右なら5列目へ、1列目で子が左なら2列目へ寄せ、縦置きはそのまま。

**L38–46**

```ts
 38 |   it('stacks vertical pairs in the right order', () => {
 39 |     const up = new Field();
 40 |     up.place(pair, 2, 0);
 41 |     expect(up.cols[2]).toEqual([0, 1]);
 42 |     const down = new Field();
 43 |     down.place(pair, 2, 2);
 44 |     expect(down.cols[2]).toEqual([1, 0]);
 45 |   });
 46 | 
```

縦置きの積む順番。子が上なら下から [軸, 子]、子が下なら [子, 軸]。

**L47–54**

```ts
 47 |   it('splits horizontal pairs onto uneven columns (chigiri)', () => {
 48 |     const f = Field.fromRows(['.2....', '.2....']);
 49 |     const moves = f.place(pair, 0, 1);
 50 |     expect(f.cols[0]).toEqual([0]);
 51 |     expect(f.cols[1]).toEqual([2, 2, 1]);
 52 |     expect(moves.every((m) => !m.vanished)).toBe(true);
 53 |   });
 54 | 
```

横置きのちぎれ。2列目だけ2段高い盤面で、1・2列目に横置きすると、1列目は床に、2列目は2段の上に、それぞれ別々に落ちるか。

**L55–63**

```ts
 55 |   it('keeps puyo on the 13th row but drops anything entering the 14th', () => {
 56 |     const f = new Field();
 57 |     f.cols[0] = Array(12).fill(3);
 58 |     const moves = f.place(pair, 0, 0);
 59 |     expect(f.height(0)).toBe(13);
 60 |     expect(f.cols[0][12]).toBe(0);
 61 |     expect(moves.find((m) => m.color === 1)?.vanished).toBe(true);
 62 |   });
 63 | 
```

13段目と14段目。12段まで埋まった列に縦置きすると、軸ぷよは13段目に残り、子ぷよは14段目に入って消えるか。`?.vanished` は、見つからなかったとき（undefined）にエラーにしないための書き方。

**L64–70**

```ts
 64 |   it('ignores the 13th row when looking for groups', () => {
 65 |     // 12段目まで埋めた列の13段目に同色を並べても消えない
 66 |     const f = new Field();
 67 |     for (let x = 0; x < 4; x++) f.cols[x] = [...Array(12).fill(x % 2 ? 1 : 2), 0];
 68 |     expect(f.findGroups().some((g) => g.some((c) => c.y === 12))).toBe(false);
 69 |   });
 70 | 
```

13段目は消去の対象外か。4列とも12段まで埋め、13段目に同じ色を4つ横に並べても、13段目（y=12）を含むグループが見つからないこと。`Array(12).fill(色)` は同じ値を12個並べた配列。

**L71–82**

```ts
 71 |   it('detects death only on column 3, row 12', () => {
 72 |     const f = new Field();
 73 |     f.cols[2] = Array(11).fill(0);
 74 |     expect(f.isDead()).toBe(false);
 75 |     f.cols[2].push(1);
 76 |     expect(f.isDead()).toBe(true);
 77 |     const g = new Field();
 78 |     g.cols[0] = Array(12).fill(0);
 79 |     expect(g.isDead()).toBe(false);
 80 |   });
 81 | });
 82 | 
```

窒息判定。3列目が11段なら生存、12段で窒息。1列目が12段でも窒息にはならない。

## 連鎖の解決

**L83–100**

```ts
 83 | describe('chain resolution', () => {
 84 |   it('resolves a 2-chain and scores it', () => {
 85 |     // 1連鎖目: 色0の縦4つ / 落ちてきた色1が横の色1とつながって2連鎖目
 86 |     const f = Field.fromRows([
 87 |       '1.....', //
 88 |       '0.....',
 89 |       '0.....',
 90 |       '0111..',
 91 |       '0.....',
 92 |     ]);
 93 |     const r = resolveChain(f);
 94 |     expect(r.steps.map((s) => s.chain)).toEqual([1, 2]);
 95 |     expect(r.steps[0].score).toBe(40);
 96 |     expect(r.steps[1].score).toBe(4 * 10 * 8);
 97 |     expect(r.totalScore).toBe(360);
 98 |     expect(r.allClear).toBe(true);
 99 |   });
100 | 
```

2連鎖の盤面を作って解決する。
- 1列目に色0が縦に4つ、その上に色1。2〜4列目の下に色1が3つ（`fromRows` は重力で詰めるので、見た目の位置ではなく一番下に置かれる）。
- 色0の4つが消える → 色1が落ちて、横の色1の3つとつながる → 2連鎖目で消える。
- 得点は 40 + 320 = 360。最後は盤面が空なので全消しになる。
- `'1.....', //` の `//` はコメント。整形ツールが配列を1行にまとめないようにするための目印。

**L101–108**

```ts
101 |   it('adds the all-clear bonus to the first link of the next chain', () => {
102 |     const f = Field.fromRows(['0', '0', '0', '0']);
103 |     const r = resolveChain(f, CONFIG.ALL_CLEAR_BONUS);
104 |     expect(r.steps[0].score).toBe(40 + CONFIG.ALL_CLEAR_BONUS);
105 |     expect(r.steps[0].allClearBonusApplied).toBe(true);
106 |   });
107 | });
108 | 
```

全消しボーナスを渡して解決すると、1連鎖目の得点に足されるか。

## ゲームの進行

**L109–130**

```ts
109 | describe('game flow', () => {
110 |   it('carries the all-clear bonus to the next chain', () => {
111 |     const game = new Game(1, 1_000_000);
112 |     // 盤面を直接作って全消しを起こす
113 |     game.field.cols[0] = [5, 5, 5];
114 |     const forcedPair = { axis: 5, child: 6 };
115 |     game.current = () => forcedPair;
116 |     const r = game.place(0, 0);
117 |     expect(r.chain.allClear).toBe(false); // 子ぷよ(6)が残る
118 |     game.field.cols = [[], [], [], [], [], []];
119 |     game.field.cols[0] = [7, 7, 7];
120 |     game.current = () => ({ axis: 7, child: 7 });
121 |     const r2 = game.place(0, 0);
122 |     expect(r2.chain.allClear).toBe(true);
123 |     expect(game.pendingAllClear).toBe(true);
124 |     game.field.cols[1] = [8, 8, 8];
125 |     game.current = () => ({ axis: 8, child: 9 });
126 |     const r3 = game.place(1, 0);
127 |     expect(r3.chain.steps[0].allClearBonusApplied).toBe(true);
128 |     expect(game.pendingAllClear).toBe(false);
129 |   });
130 | 
```

全消しボーナスが「次の連鎖」に持ち越されるか。
- `game.current = () => forcedPair` … テストのために、ツモを決まったペアに差し替えている（メソッドを上書きできる JavaScript の性質を使った小技）。色番号5〜9は本来のゲームでは出ない値だが、テストでは区別しやすさのために使っている。
- 1手目: 4つ消えるが子ぷよが残るので全消しではない。
- 盤面を空にして2手目: 4つ消えて全消し。ボーナス待ち状態になる。
- 3手目: 連鎖の1連鎖目にボーナスが乗り、待ち状態が解除される。

**L131–139**

```ts
131 |   it('finishes when the target is reached', () => {
132 |     const game = new Game(1, 40);
133 |     game.field.cols[0] = [5, 5, 5];
134 |     game.current = () => ({ axis: 5, child: 6 });
135 |     const r = game.place(0, 0);
136 |     expect(r.cleared).toBe(true);
137 |     expect(game.finished).toBe('cleared');
138 |   });
139 | 
```

目標点（ここでは40点）に届いたらクリアになるか。

**L140–149**

```ts
140 |   it('builds a timeline that ends at the last fall', () => {
141 |     const f = Field.fromRows(['1.....', '0.....', '0.....', '0111..', '0.....']);
142 |     const chain = resolveChain(f);
143 |     const tl = buildTimeline([], chain);
144 |     expect(tl.steps).toHaveLength(2);
145 |     expect(tl.total).toBe(tl.steps[1].fallEnd);
146 |     expect(tl.steps[1].popStart).toBe(tl.steps[0].fallEnd + CONFIG.CHAIN_GAP_MS);
147 |   });
148 | });
149 | 
```

時刻表。2連鎖なら連鎖の区切りが2つあり、全体の長さは最後の落下が終わる時刻で、2連鎖目は1連鎖目の落下終了から `CHAIN_GAP_MS` 後に始まるか。

## 配ぷよ

**L150–156**

```ts
150 | describe('tsumo', () => {
151 |   it('is deterministic per seed and loops every 128 pairs', () => {
152 |     expect(generateTsumo(123)).toEqual(generateTsumo(123));
153 |     expect(generateTsumo(123)).not.toEqual(generateTsumo(124));
154 |     expect(generateTsumo(1)).toHaveLength(128);
155 |   });
156 | 
```

同じシードなら同じ配ぷよ、違うシードなら違う配ぷよ、そして128手ぶん作られるか。

**L157–164**

```ts
157 |   it('limits the first two pairs to three colors', () => {
158 |     for (let seed = 0; seed < 2000; seed++) {
159 |       const t = generateTsumo(seed);
160 |       const colors = new Set([t[0].axis, t[0].child, t[1].axis, t[1].child]);
161 |       expect(colors.size).toBeLessThanOrEqual(3);
162 |     }
163 |   });
164 | 
```

最初の2手が3色以内か。シード0〜1999のすべてで確かめる。

**L165–172**

```ts
165 |   it('shares the opening between color counts', () => {
166 |     for (let seed = 0; seed < 200; seed++) {
167 |       const three = generateTsumo(seed, 3).slice(0, 2);
168 |       expect(generateTsumo(seed, 4).slice(0, 2)).toEqual(three);
169 |       expect(generateTsumo(seed, 5).slice(0, 2)).toEqual(three);
170 |     }
171 |   });
172 | 
```

最初の2手は、3色・4色・5色のどれで遊んでも同じになるか。ぷよぷよeスポーツの方式では、4色・5色の表の先頭4個を3色の表で上書きするので、こうなるはず。

**L173–187**

```ts
173 |   it('deals each color 64 times per loop apart from the opening', () => {
174 |     for (let seed = 0; seed < 200; seed++) {
175 |       const t = generateTsumo(seed, 4);
176 |       const counts = new Map<number, number>();
177 |       for (const p of t.slice(2)) {
178 |         counts.set(p.axis, (counts.get(p.axis) ?? 0) + 1);
179 |         counts.set(p.child, (counts.get(p.child) ?? 0) + 1);
180 |       }
181 |       // 4色の表は各色64個。先頭4個を3色の表で上書きするので、残り252個の内訳は各色60〜64個
182 |       expect(counts.size).toBe(4);
183 |       for (const c of counts.values()) expect(c).toBeGreaterThanOrEqual(60);
184 |       for (const c of counts.values()) expect(c).toBeLessThanOrEqual(64);
185 |     }
186 |   });
187 | 
```

1ループ（128手）の中の色の数。4色の表は 0,1,2,3 を64個ずつ並べてから入れ替えるので、どのシードでも各色ほぼ同じ数になる（旧方式は1個ずつ独立に乱数で決めていたため、ループの中で色が偏ることがあった）。
先頭4個は3色の表で上書きされるので、そこを除いた残り252個で、4色すべてが出ていて、各色が60〜64個に収まっているかを確かめる。
`new Map()` は「キー → 値」の対応表。ここでは「色 → 出た数」。

**L188–192**

```ts
188 |   it('treats seed 65536 as seed 0', () => {
189 |     expect(generateTsumo(65536)).toEqual(generateTsumo(0));
190 |   });
191 | });
192 | 
```

シード番号は 1〜65536 で選ぶが、生成には下16bit を使う。65536 は 0 と同じ配ぷよになるか。

## 1手戻す

**L193–213**

```ts
193 | describe('undo', () => {
194 |   it('restores the field, score and tsumo position', () => {
195 |     const game = new Game(77, 1_000_000);
196 |     const first = game.current();
197 |     game.place(0, 0);
198 |     game.place(1, 1);
199 |     const snapshot = game.field.cols.map((c) => [...c]);
200 |     const score = game.score;
201 |     game.place(3, 2);
202 |     expect(game.undo()).toEqual({ x: 3, rot: 2 });
203 |     expect(game.field.cols).toEqual(snapshot);
204 |     expect(game.score).toBe(score);
205 |     expect(game.moves).toBe(2);
206 |     game.undo();
207 |     game.undo();
208 |     expect(game.moves).toBe(0);
209 |     expect(game.current()).toEqual(first);
210 |     expect(game.undo()).toBeNull();
211 |     expect(game.undos).toBe(3);
212 |   });
213 | 
```

3手置いてから戻すと、盤面・スコア・手数が2手目の後に戻り、返ってくる位置と向きが3手目のものか。さらに2回戻すと最初の状態に戻って最初のペアがまた来ること、それ以上は戻せない（`null`）こと、戻した回数が3回と数えられていること。

**L214–232**

```ts
214 |   it('can undo out of a death but not out of a clear', () => {
215 |     const dead = new Game(1, 1_000_000);
216 |     dead.field.cols[2] = Array(10).fill(0).map((_, i) => i % 2);
217 |     dead.current = () => ({ axis: 2, child: 3 });
218 |     dead.place(2, 0);
219 |     expect(dead.finished).toBe('dead');
220 |     expect(dead.canUndo()).toBe(true);
221 |     dead.undo();
222 |     expect(dead.finished).toBeNull();
223 |     expect(dead.field.height(2)).toBe(10);
224 | 
225 |     const clear = new Game(1, 40);
226 |     clear.field.cols[0] = [5, 5, 5];
227 |     clear.current = () => ({ axis: 5, child: 6 });
228 |     clear.place(0, 0);
229 |     expect(clear.finished).toBe('cleared');
230 |     expect(clear.canUndo()).toBe(false);
231 |   });
232 | });
```

窒息からは戻せて、戻すと終了状態が解除され盤面が置く前の高さに戻ること。クリアからは戻せないこと。
- `Array(10).fill(0).map((_, i) => i % 2)` … 0と1を交互に10個並べる（つながって消えないように）。
