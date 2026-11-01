# src/core/game.ts

1ゲームの進行を管理するファイル。盤面・ツモ・スコア・手数などを持ち、「1手置く」「1手戻す」を受け付ける。

大事な設計方針として、**このクラスは時間を一切扱わない**。置いた瞬間に連鎖まで全部計算し終え、「アニメーションに何ミリ秒かかるか」を数字で返すだけ。
実際に時間を進めて絵を動かすのは `main.ts` と `renderer.ts` の仕事。こう分けておくと、ゲームのルールを画面なしでテストできる。

**L1–5**

```ts
  1 | import { CONFIG } from '../config';
  2 | import { resolveChain, type ChainResult } from './chain';
  3 | import { Field, type Move, type Rotation } from './field';
  4 | import { TsumoSequence, type Pair } from './tsumo';
  5 | 
```

必要なものを読み込む。`import { resolveChain, type ChainResult }` のように、値（関数）と型を1行で混ぜて読み込むこともできる。

## アニメーションの時刻表 Timeline

**L6–14**

```ts
  6 | /** 1手ぶんのアニメーションの区切り（ターン開始からの経過ミリ秒） */
  7 | export interface Timeline {
  8 |   /** 設置の落下が終わる時刻 */
  9 |   placeEnd: number;
 10 |   /** 各連鎖の [消去開始, 落下開始, 落下終了] */
 11 |   steps: { popStart: number; fallStart: number; fallEnd: number }[];
 12 |   /** ターン全体の長さ */
 13 |   total: number;
 14 | }
```

1手ぶんの演出の「何ミリ秒目に何が起きるか」。時刻はすべてその手を置いた瞬間を0とした経過時間。
- `placeEnd` … 置いたぷよが着地し終わる時刻。
- `steps` … 連鎖ごとに、消え始め `popStart`・落ち始め `fallStart`・落ち終わり `fallEnd`。
- `total` … その手の演出全体が終わる時刻。この間は次の操作を受け付けず、タイムも進む。

**L15–25**

```ts
 15 | 
 16 | export interface TurnResult {
 17 |   pair: Pair;
 18 |   placeMoves: Move[];
 19 |   chain: ChainResult;
 20 |   scoreBefore: number;
 21 |   scoreAfter: number;
 22 |   timeline: Timeline;
 23 |   cleared: boolean;
 24 |   dead: boolean;
 25 | }
```

`TurnResult` … `place()` が返す「1手の結果」。置いたペア、置いたときの落下、連鎖の結果、置く前後のスコア、時刻表、クリアしたか、窒息したか。

**L26–29**

```ts
 26 | 
 27 | function maxFall(moves: Move[]): number {
 28 |   return moves.reduce((m, mv) => Math.max(m, mv.fromY - mv.toY), 0);
 29 | }
```

`maxFall(moves)` … 移動の中で一番長く落ちた段数。全部のぷよが同じ速さで落ちるので、一番長く落ちるぷよが着地した時点でその落下は終わる。
`reduce((m, mv) => Math.max(m, ...), 0)` は「0から始めて、より大きい値があれば更新」で最大値を求める書き方。

## 時刻表を作る buildTimeline

**L30–44**

```ts
 30 | 
 31 | export function buildTimeline(placeMoves: Move[], chain: ChainResult): Timeline {
 32 |   let t = maxFall(placeMoves) * CONFIG.PLACE_FALL_MS_PER_ROW;
 33 |   const placeEnd = t;
 34 |   const steps = chain.steps.map((s) => {
 35 |     const popStart = t;
 36 |     const fallStart = popStart + CONFIG.CHAIN_POP_MS;
 37 |     const fallEnd = fallStart + maxFall(s.falls) * CONFIG.CHAIN_FALL_MS_PER_ROW;
 38 |     t = fallEnd + CONFIG.CHAIN_GAP_MS;
 39 |     return { popStart, fallStart, fallEnd };
 40 |   });
 41 |   // 最後の連鎖のあとの待ち時間は不要
 42 |   const total = steps.length ? steps[steps.length - 1].fallEnd : placeEnd;
 43 |   return { placeEnd, steps, total };
 44 | }
```

- L32: 置いたぷよの落下時間＝最大落下段数 × 1段あたりの時間。変数 `t` を「今の時刻」として先へ進めていく。
- L33: そこが設置の終わり。
- L34–40: 連鎖ごとに時刻を割り当てる。`map` は配列の各要素を変換した新しい配列を作る。
  - 消え始め → `CHAIN_POP_MS` 後に落ち始め → 最大落下段数ぶん後に落ち終わり → `CHAIN_GAP_MS` 空けて次の連鎖。
- L42: 演出全体の長さ。最後の連鎖の後に小休止はいらないので、最後の `fallEnd` を使う。連鎖がなければ設置の終わり。
- L43: `{ placeEnd, steps, total }` は `{ placeEnd: placeEnd, ... }` の省略形。

## Game クラス

**L45–49**

```ts
 45 | 
 46 | /**
 47 |  * ゲーム本体（時間を持たない純粋なロジック）。
 48 |  * 1手ごとに place() を呼ぶと、連鎖まで解決した結果とアニメーション時間を返す。
 49 |  */
```

クラスの説明コメント。

**L50–57**

```ts
 50 | export class Game {
 51 |   readonly field = new Field();
 52 |   readonly tsumo: TsumoSequence;
 53 |   score = 0;
 54 |   moves = 0;
 55 |   maxChain = 0;
 56 |   pendingAllClear = false;
 57 |   finished: 'cleared' | 'dead' | null = null;
```

ゲームの状態。
- `readonly field = new Field()` … 盤面。`readonly` なので別の盤面に差し替えはできないが、中身（`field.cols`）は変えられる。
- `tsumo` … 配ぷよ。コンストラクタで作る。
- `score` / `moves` / `maxChain` … スコア、手数、最大連鎖。
- `pendingAllClear` … 「直前に全消しして、次の連鎖にボーナスが乗る」状態か。
- `finished` … 終了状態。`'cleared' | 'dead' | null` は「クリア」「窒息」「まだ続いている」のどれか。

**L58–68**

```ts
 58 |   /** 1手戻した回数 */
 59 |   undos = 0;
 60 |   private history: {
 61 |     cols: number[][];
 62 |     score: number;
 63 |     maxChain: number;
 64 |     pendingAllClear: boolean;
 65 |     x: number;
 66 |     rot: Rotation;
 67 |   }[] = [];
 68 | 
```

1手戻す用。
- `undos` … 戻した回数（ランキングに記録）。
- `history` … 置くたびに「置く前の状態」を積んでいく配列。盤面のコピー、スコア、最大連鎖、全消し状態、そして置いた位置と向き（戻した後にカーソルをそこへ戻すため）。

**L69–74**

```ts
 69 |   constructor(
 70 |     readonly seed: number,
 71 |     readonly target: number,
 72 |   ) {
 73 |     this.tsumo = new TsumoSequence(seed);
 74 |   }
```

コンストラクタ。`readonly seed` と `readonly target` は引数をそのままプロパティにする省略記法（`tsumo.ts` の解説を参照）。シードから配ぷよを作る。

**L75–78**

```ts
 75 | 
 76 |   current(): Pair {
 77 |     return this.tsumo.at(this.moves);
 78 |   }
```

`current()` … 今置くペア。手数がそのまま「何手目か」になる。

**L79–82**

```ts
 79 | 
 80 |   nexts(count = CONFIG.NEXT_COUNT): Pair[] {
 81 |     return Array.from({ length: count }, (_, i) => this.tsumo.at(this.moves + 1 + i));
 82 |   }
```

`nexts()` … ネクスト（次とその次）。`Array.from({ length: 2 }, (_, i) => ...)` で、i=0,1 について `moves + 1 + i` 手目を取り出す。

## 1手置く place

**L83–94**

```ts
 83 | 
 84 |   place(axisX: number, rot: Rotation): TurnResult {
 85 |     if (this.finished) throw new Error('game already finished');
 86 |     const pair = this.current();
 87 |     this.history.push({
 88 |       cols: this.field.cols.map((c) => [...c]),
 89 |       score: this.score,
 90 |       maxChain: this.maxChain,
 91 |       pendingAllClear: this.pendingAllClear,
 92 |       x: axisX,
 93 |       rot,
 94 |     });
```

- L85: 終わったゲームで置こうとしたらエラーにする（`throw`）。画面側で防いでいるので通常は起きない、安全装置。
- L86: 置くペア。
- L87–94: 置く**前**の状態を履歴に保存。盤面は `map((c) => [...c])` で列ごとに複製する（参照のままだと、この後盤面が変わったときに履歴まで変わってしまう）。

**L95–100**

```ts
 95 |     const placeMoves = this.field.place(pair, axisX, rot);
 96 |     const bonus = this.pendingAllClear ? CONFIG.ALL_CLEAR_BONUS : 0;
 97 |     const chain = resolveChain(this.field, bonus);
 98 |     if (chain.steps.length > 0) this.pendingAllClear = false;
 99 |     if (chain.allClear) this.pendingAllClear = true;
100 | 
```

- L95: 盤面に置く。落下の記録が返る。
- L96: 全消しボーナス待ちなら 2100、そうでなければ 0。
- L97: 連鎖を最後まで解決。
- L98: 1回でも連鎖したら、ボーナスは使い切ったので待ち状態を解除。
- L99: この手でまた全消ししたら、次の連鎖に向けて待ち状態にする。

**L101–105**

```ts
101 |     const scoreBefore = this.score;
102 |     this.score += chain.totalScore;
103 |     this.moves++;
104 |     this.maxChain = Math.max(this.maxChain, chain.steps.length);
105 | 
```

- L101: 置く前のスコアを控える。
- L102–104: スコア加算、手数を1増やす（`++`）、最大連鎖を更新。

**L106–110**

```ts
106 |     const cleared = this.score >= this.target;
107 |     const dead = !cleared && this.field.isDead();
108 |     if (cleared) this.finished = 'cleared';
109 |     else if (dead) this.finished = 'dead';
110 | 
```

終了判定。
- L106: 目標点以上ならクリア。
- L107: クリアしていない場合だけ窒息を判定する。最後の連鎖で目標に届いたなら、盤面が高くてもクリアを優先する。

**L111–121**

```ts
111 |     return {
112 |       pair,
113 |       placeMoves,
114 |       chain,
115 |       scoreBefore,
116 |       scoreAfter: this.score,
117 |       timeline: buildTimeline(placeMoves, chain),
118 |       cleared,
119 |       dead,
120 |     };
121 |   }
```

結果をまとめて返す。時刻表もここで作る。

**L122–126**

```ts
122 | 
123 |   /** 1手戻せるか（クリア後は不可、窒息後は可） */
124 |   canUndo(): boolean {
125 |     return this.history.length > 0 && this.finished !== 'cleared';
126 |   }
```

`canUndo()` … 戻せるか。履歴があって、クリアしていなければOK。窒息後は戻せる（窒息からの復帰に使う）。

## 1手戻す undo

**L127–141**

```ts
127 | 
128 |   /** 直前の1手を取り消す。取り消した手の位置と向きを返す */
129 |   undo(): { x: number; rot: Rotation } | null {
130 |     if (!this.canUndo()) return null;
131 |     const h = this.history.pop()!;
132 |     this.field.cols = h.cols;
133 |     this.score = h.score;
134 |     this.maxChain = h.maxChain;
135 |     this.pendingAllClear = h.pendingAllClear;
136 |     this.moves--;
137 |     this.finished = null;
138 |     this.undos++;
139 |     return { x: h.x, rot: h.rot };
140 |   }
141 | }
```

- 戻り値の型 `{ x: number; rot: Rotation } | null` … 戻せたら置いていた位置と向き、戻せなければ `null`。
- L130: 戻せないなら何もしない。
- L131: 履歴の最後（＝直前の手）を取り出す。`pop()` は配列の末尾を取り除いて返す。
- L132–135: 盤面とスコアなどを置く前に戻す。
- L136: 手数を1減らす。`current()` は手数でツモを決めているので、これだけで「さっきのペア」がまた手元に来る。
- L137: 終了状態を解除（窒息からの復帰）。
- L138: 戻した回数を数える。ペナルティ（+5秒）の加算は時間を扱う `main.ts` 側で行う。
