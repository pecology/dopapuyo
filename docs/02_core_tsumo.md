# src/core/tsumo.ts

配ぷよ（ツモ）を作るファイル。**同じシード番号からは必ず同じ配ぷよが出る**ようにするのがポイント。
`Math.random()` は毎回違う値を返すので使えない。代わりに「種（シード）から決まった順番で数を出す」自前の乱数を使う。

作り方は**ぷよぷよeスポーツと同じ方式**にしている。本家の作り方は解析されて公開されている（参考: Puyo Nexus の解説 https://puyonexus.com/wiki/Puyo_Puyo!!_20th_Anniversary/Upcoming_Pair_Randomizer 。ぷよぷよ!!20th 以降の作品で使われ、ぷよぷよeスポーツ＝海外名 Puyo Puyo Champions もこの方式）。
本家のデータを入れているのではなく、同じ計算をこのファイルでしている。

方式のあらまし:
1. シード（0〜65535）から乱数を作る
2. 5色の並び順（カラーマップ）を決める
3. 3色用・4色用・5色用に、色番号を `0,1,2,0,1,2,…` のように256個並べた表を作り、それぞれを乱数で混ぜる
4. 4色・5色の表の先頭4個を、3色の表の先頭4個で上書きする（だから最初の2手は必ず3色以内）
5. 表を前から2個ずつ取って128手にする

表には各色が同じ数ずつ入っているので、**128手の中で色の出る数がほぼ均等になる**。1個ずつ独立にサイコロを振る方式（以前の本作）だと、ある色ばかり続いたり来なかったりする偏りが起きやすい。

**L1–2**

```ts
 1 | import { CONFIG } from '../config';
 2 | 
```

`config.ts` から `CONFIG` を読み込む。`'../config'` の `..` は「1つ上のフォルダ」。このファイルは `src/core/` にあるので、`src/config.ts` を指す。

## 型の定義

**L3–9**

```ts
 3 | /** 色番号（0 〜 4。描画側の GEMS の並び＝赤・緑・青・黄・紫） */
 4 | export type Color = number;
 5 | export interface Pair {
 6 |   axis: Color;
 7 |   child: Color;
 8 | }
 9 | 
```

- `export type Color = number;` … 「色」は数値で表す（0=赤、1=緑、2=青、3=黄、4=紫）という**型の別名**。この並びは描画側の宝石（`render/gems.ts` の `GEMS`）の順番と同じ。中身はただの number だが、コードを読むときに「これは色だ」とわかる。
- `export interface Pair { axis: Color; child: Color; }` … 1手ぶんの2個組。`axis` が軸ぷよ、`child` が子ぷよ。`interface` は「このオブジェクトはこういうプロパティを持つ」という形の宣言。

**L10–14**

```ts
10 | /** 配ぷよ1ループの個数（128手ぶん） */
11 | const POOL_SIZE = 256;
12 | /** 本家の色の総数 */
13 | const ALL_COLORS = 5;
14 | 
```

- `POOL_SIZE = 256` … 表の大きさ。2個で1手なので128手ぶん。128手でループするのはこのため。
- `ALL_COLORS = 5` … 本家の色は全部で5色。4色で遊ぶときも、5色のうちどの4色を使うかはシードで決まる。

## 乱数 createRng

**L15–26**

```ts
15 | /**
16 |  * ぷよぷよeスポーツと同じ線形合同法の乱数。
17 |  * 状態を進めてから、上位16bitを 0〜m-1 に縮めて返す（剰余ではなく掛けて16bitずらす）。
18 |  */
19 | export function createRng(seed: number): (m: number) => number {
20 |   let s = seed >>> 0;
21 |   return (m) => {
22 |     s = (Math.imul(s, 0x5d588b65) + 0x269ec3) >>> 0;
23 |     return ((s >>> 16) * m) >>> 16;
24 |   };
25 | }
26 | 
```

**線形合同法**（LCG）という昔からある乱数の作り方で、本家と同じ定数を使う。
- L20: 状態 `s` をシードで初期化する。`>>> 0` は「32bit の符号なし整数にする」おまじない。
- L22: 次の状態を「今の状態 × 0x5D588B65 ＋ 0x269EC3」で作る。`0x` は16進数。`Math.imul` は32bit 同士の掛け算（普通の `*` だと桁があふれて誤差が出るので使う）。`>>> 0` で32bit に収める。
- L23: 状態の上位16bit（`s >>> 16`、0〜65535）に `m` を掛けて、また16bit 右にずらす。これで 0〜m-1 の数になる。`%`（割った余り）ではなくこの方法を使うのも本家と同じ。
- 戻り値は「呼ぶたびに次の数を返す関数」。`rand(5)` なら 0〜4 のどれかが返る。

## 配ぷよを作る generateTsumo

**L27–36**

```ts
27 | /**
28 |  * シードから1ループ分（128手）の配ぷよを生成する（ぷよぷよeスポーツの方式）。
29 |  * 1. 5色の並び順（カラーマップ）を決める
30 |  * 2. 3色・4色・5色用に 0,1,2,… を順に並べた256個の表を作り、それぞれをシャッフルする
31 |  *    （16個・32個・64個ずつの区画で、隣り合う区画どうしの要素を入れ替える）
32 |  * 3. 4色・5色の表の先頭4個を3色の表で上書きする（最初の2手は必ず3色以内）
33 |  * 表に各色が同じ数ずつ入っているので、1ループ内の色の出現数はほぼ均等になる。
34 |  */
35 | export function generateTsumo(seed: number, colorCount: number = CONFIG.COLOR_COUNT): Pair[] {
36 |   const rand = createRng(seed & 0xffff);
```

- 引数 `seed` … シード番号。`& 0xffff` で下16bit（0〜65535）だけを使う。本作のシード番号は 1〜65536 なので、65536 は本家の 0 番と同じになる。1〜65535 は本家の同じ番号。
- 引数 `colorCount` … 色数（3〜5）。省略すると `CONFIG.COLOR_COUNT`（4）。

**L37–42**

```ts
37 | 
38 |   const remaining = Array.from({ length: ALL_COLORS }, (_, i) => i);
39 |   const colorMap: Color[] = [];
40 |   for (let k = ALL_COLORS; k >= 1; k--) {
41 |     colorMap.push(remaining.splice(rand(k), 1)[0]);
42 |   }
```

カラーマップを作る。
- L38: `remaining` は残っている色 `[0, 1, 2, 3, 4]`。`Array.from({ length: 5 }, (_, i) => i)` は「長さ5で、i 番目が i の配列」。
- L40–42: 5回、残りの中から乱数で1色選んで `colorMap` に入れ、`remaining` から取り除く（`splice(位置, 1)` は1個取り除いて、取り除いた要素の配列を返す）。
- たとえば `colorMap` が `[3, 2, 1, 0, 4]` なら、表の「0」は黄、「1」は青…と読み替える。4色なら `colorMap` の先頭4色が使われる。

**L43–56**

```ts
43 | 
44 |   const pools = [3, 4, 5].map((n) => {
45 |     const pool = Array.from({ length: POOL_SIZE }, (_, i) => i % n);
46 |     for (const len of [16, 32, 64]) {
47 |       for (let row = 0; row < POOL_SIZE / len - 1; row++) {
48 |         for (let k = 0; k < len / 2; k++) {
49 |           const a = row * len + rand(len);
50 |           const b = (row + 1) * len + rand(len);
51 |           [pool[a], pool[b]] = [pool[b], pool[a]];
52 |         }
53 |       }
54 |     }
55 |     return pool;
56 |   });
```

3色・4色・5色の表を作って混ぜる。3つの表は同じ乱数を続けて使うので、順番（3色→4色→5色）も本家どおりにしてある。
- L45: `i % n` で `0, 1, …, n-1, 0, 1, …` と256個並べる。4色なら各色64個ずつ。
- L46–54: 表を16個ずつ・32個ずつ・64個ずつの区画に分けて、3回混ぜる。
  - L47: `row` は区画の番号。最後の区画の手前まで。
  - L48–52: 区画 `row` と次の区画 `row + 1` から1個ずつ乱数で選び、入れ替える。これを区画の大きさの半分の回数くり返す。
  - L51: `[a, b] = [b, a]` は2つの値を入れ替える書き方（分割代入）。
- 隣の区画とだけ入れ替えるので、完全にばらばらには混ざらない。これも本家どおり。

**L57–61**

```ts
57 |   for (let i = 0; i < 4; i++) {
58 |     pools[1][i] = pools[0][i];
59 |     pools[2][i] = pools[0][i];
60 |   }
61 | 
```

4色・5色の表の先頭4個（＝最初の2手）を、3色の表の先頭4個で上書きする。だから何色で遊んでも、最初の2手は同じで、必ず3色以内になる。
`pools[0]` が3色、`pools[1]` が4色、`pools[2]` が5色の表。

**L62–68**

```ts
62 |   const pool = pools[Math.min(Math.max(colorCount, 3), 5) - 3];
63 |   const pairs: Pair[] = [];
64 |   for (let i = 0; i < POOL_SIZE; i += 2) {
65 |     pairs.push({ axis: colorMap[pool[i]], child: colorMap[pool[i + 1]] });
66 |   }
67 |   return pairs;
68 | }
```

- L62: 色数に合った表を選ぶ。`Math.min(Math.max(colorCount, 3), 5)` で 3〜5 に収めてから3を引くので、0〜2 の番号になる。
- L64–66: 表を前から2個ずつ取り、カラーマップで本当の色に読み替えて1手にする。1個目を軸ぷよ、2個目を子ぷよにしている。
- L67: 128手の配列を返す。

**L69–73**

```ts
69 | 
70 | /** シードをランダムに選ぶ（1〜SEED_COUNT） */
71 | export function randomSeed(): number {
72 |   return 1 + Math.floor(Math.random() * CONFIG.SEED_COUNT);
73 | }
```

ランダムなシード番号（1〜65536）を選ぶ。こちらは「毎回違ってほしい」ので `Math.random()` を使う。
`Math.floor(Math.random() * 65536)` が 0〜65535 なので、1を足して 1〜65536 にしている。

## ループするツモ列 TsumoSequence

**L74–84**

```ts
74 | 
75 | /** ループするツモ列 */
76 | export class TsumoSequence {
77 |   private readonly pairs: Pair[];
78 |   constructor(public readonly seed: number) {
79 |     this.pairs = generateTsumo(seed);
80 |   }
81 |   at(index: number): Pair {
82 |     return this.pairs[index % this.pairs.length];
83 |   }
84 | }
```

生成した128手を持っておき、何手目でも取り出せるようにする**クラス**。
- L77: `private readonly pairs` … クラスの外から見えない（`private`）、作った後は変えない（`readonly`）プロパティ。
- L78: `constructor(public readonly seed: number)` … 引数に `public readonly` を付けると、「引数を受け取る」と「同名のプロパティに保存する」を一度に書ける TypeScript の省略記法。`new TsumoSequence(123).seed` で 123 が読める。
- L79: 作った瞬間に128手を生成しておく。
- L81–83: `at(index)` で index 手目のペアを返す。`%`（割った余り）を使うので、128手目は0手目に戻る＝**128手ループ**になる。
