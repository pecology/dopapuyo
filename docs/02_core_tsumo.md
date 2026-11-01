# src/core/tsumo.ts

配ぷよ（ツモ）を作るファイル。**同じシード番号からは必ず同じ配ぷよが出る**ようにするのがポイント。
`Math.random()` は毎回違う値を返すので使えない。代わりに「種（シード）から決まった順番で数を出す」自前の乱数を使う。

**L1–2**

```ts
 1 | import { CONFIG } from '../config';
 2 | 
```

`config.ts` から `CONFIG` を読み込む。`'../config'` の `..` は「1つ上のフォルダ」。このファイルは `src/core/` にあるので、`src/config.ts` を指す。

## 型の定義

**L3–8**

```ts
 3 | /** 色番号（0 〜 COLOR_COUNT-1） */
 4 | export type Color = number;
 5 | export interface Pair {
 6 |   axis: Color;
 7 |   child: Color;
 8 | }
```

- `export type Color = number;` … 「色」は数値で表す（0=赤、1=緑…）という**型の別名**。中身はただの number だが、コードを読むときに「これは色だ」とわかる。
- `export interface Pair { axis: Color; child: Color; }` … 1手ぶんの2個組。`axis` が軸ぷよ、`child` が子ぷよ。`interface` は「このオブジェクトはこういうプロパティを持つ」という形の宣言。

## 擬似乱数 mulberry32

**L9–20**

```ts
 9 | 
10 | /** 決定的な32bit擬似乱数（mulberry32） */
11 | export function createRng(seed: number): () => number {
12 |   let s = seed >>> 0;
13 |   return () => {
14 |     s = (s + 0x6d2b79f5) >>> 0;
15 |     let t = s;
16 |     t = Math.imul(t ^ (t >>> 15), t | 1);
17 |     t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
18 |     return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
19 |   };
20 | }
```

`createRng(seed)` は「呼ぶたびに 0以上1未満の数を返す関数」を作って返す。同じ seed なら、返ってくる数の並びは毎回同じになる。

- L11: 戻り値の型 `() => number` は「引数なしで number を返す関数」。
- L12: `seed >>> 0` は、数値を **0〜4294967295 の32bit符号なし整数**に変換するおまじない。`>>>` は「符号なし右シフト」で、0ビットずらすと整数化だけが起きる。
- L13–19: 返す関数の本体。外側の変数 `s` を覚えていて（**クロージャ**）、呼ばれるたびに `s` を進める。
- L14: `s` に決まった大きな数を足して状態を進める。
- L15–17: `^`（XOR）、`>>>`（ビットシフト）、`Math.imul`（32bit同士の掛け算）を組み合わせて、ビットをよくかき混ぜる。ここの定数は mulberry32 という有名なアルゴリズムで決まっているもので、意味を持つ値というより「よく混ざることが確かめられた値」。
- L18: 最後に32bit整数にして `4294967296`（2の32乗）で割り、0以上1未満の小数にする。

**L21–24**

```ts
21 | 
22 | function randInt(rng: () => number, n: number): number {
23 |   return Math.floor(rng() * n);
24 | }
```

`randInt(rng, n)` は 0〜n-1 の整数を1つ返す補助関数。`rng()` が 0以上1未満なので、n を掛けて `Math.floor`（切り捨て）すれば 0〜n-1 になる。
`export` していないので、このファイルの中だけで使う。

## 配ぷよの生成 generateTsumo

**L25–36**

```ts
25 | 
26 | /**
27 |  * シードから1ループ分（TSUMO_LOOP 手）の配ぷよを生成する。
28 |  * - 最初の2手（4個）は OPENING_COLOR_LIMIT 色以内
29 |  * - 3手目以降は各ぷよが独立に一様ランダム
30 |  */
31 | export function generateTsumo(
32 |   seed: number,
33 |   colorCount: number = CONFIG.COLOR_COUNT,
34 |   loop: number = CONFIG.TSUMO_LOOP,
35 |   openingLimit: number = CONFIG.OPENING_COLOR_LIMIT,
36 | ): Pair[] {
```

シードから128手ぶんの配ぷよを作る関数の宣言部分。
- 引数の `colorCount: number = CONFIG.COLOR_COUNT` は**デフォルト引数**。呼ぶときに省略すると CONFIG の値が使われる。テストでは別の値を渡して試せる。
- 戻り値は `Pair[]`（Pair の配列）。

**L37–39**

```ts
37 |   // シード値をかき混ぜてから使う（隣り合うシードの相関を避ける）
38 |   const rng = createRng(Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) ^ 0xc2b2ae35);
39 | 
```

乱数の準備。シード番号 1, 2, 3… はお互いに似たビット列なので、そのまま種にすると最初のほうの乱数が似通うおそれがある。
そこで `Math.imul` と XOR で一度シードをかき混ぜてから `createRng` に渡している。ここの定数も「よく混ざる」ことで知られる値（ハッシュ関数でよく使われるもの）。

**L40–46**

```ts
40 |   // 開幕用の色の部分集合
41 |   const all = Array.from({ length: colorCount }, (_, i) => i);
42 |   for (let i = all.length - 1; i > 0; i--) {
43 |     const j = randInt(rng, i + 1);
44 |     [all[i], all[j]] = [all[j], all[i]];
45 |   }
46 |   const opening = all.slice(0, Math.min(openingLimit, colorCount));
```

開幕2手で使う3色を決める。
- L41: `Array.from({ length: colorCount }, (_, i) => i)` で `[0, 1, 2, 3]` を作る。`_` は「使わない引数」の慣習的な名前。
- L42–45: **フィッシャー–イェーツのシャッフル**。配列の後ろから順に、ランダムな位置の要素と入れ替えていくと、偏りなく並びがシャッフルされる。L44 の `[a, b] = [b, a]` は**分割代入**を使った入れ替えの書き方。
- L46: シャッフルした先頭から3つ（`openingLimit` 個）を取り出す。`Math.min` は色数が3より少ない設定にしたときの保険。

**L47–55**

```ts
47 | 
48 |   const pairs: Pair[] = [];
49 |   for (let i = 0; i < loop; i++) {
50 |     const pool = i < 2 ? opening : null;
51 |     const pick = () => (pool ? pool[randInt(rng, pool.length)] : randInt(rng, colorCount));
52 |     pairs.push({ axis: pick(), child: pick() });
53 |   }
54 |   return pairs;
55 | }
```

128手ぶんのペアを作る。
- L50: 最初の2手（`i < 2`）は開幕用の3色 `opening` から選び、それ以降は `null`（＝全色から選ぶ）にする。
- L51: `pick` は1個ぶんの色を選ぶ小さな関数。`pool ? A : B` で、`pool` があればその中から、なければ全色から選ぶ。
- L52: 軸ぷよと子ぷよを1個ずつ選んで配列に追加。
- L54: 完成した配列を返す。

**L56–60**

```ts
56 | 
57 | /** シードをランダムに選ぶ（1〜SEED_COUNT） */
58 | export function randomSeed(): number {
59 |   return 1 + Math.floor(Math.random() * CONFIG.SEED_COUNT);
60 | }
```

ランダムなシード番号（1〜65536）を選ぶ。こちらは「毎回違ってほしい」ので `Math.random()` を使う。
`Math.floor(Math.random() * 65536)` が 0〜65535 なので、1を足して 1〜65536 にしている。

## ループするツモ列 TsumoSequence

**L61–71**

```ts
61 | 
62 | /** ループするツモ列 */
63 | export class TsumoSequence {
64 |   private readonly pairs: Pair[];
65 |   constructor(public readonly seed: number) {
66 |     this.pairs = generateTsumo(seed);
67 |   }
68 |   at(index: number): Pair {
69 |     return this.pairs[index % this.pairs.length];
70 |   }
71 | }
```

生成した128手を持っておき、何手目でも取り出せるようにする**クラス**。
- L64: `private readonly pairs` … クラスの外から見えない（`private`）、作った後は変えない（`readonly`）プロパティ。
- L65: `constructor(public readonly seed: number)` … 引数に `public readonly` を付けると、「引数を受け取る」と「同名のプロパティに保存する」を一度に書ける TypeScript の省略記法。`new TsumoSequence(123).seed` で 123 が読める。
- L66: 作った瞬間に128手を生成しておく。
- L68–70: `at(index)` で index 手目のペアを返す。`%`（割った余り）を使うので、128手目は0手目に戻る＝**128手ループ**になる。
