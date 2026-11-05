# src/core/tsumo.ts

配ぷよ（ツモ）を作るファイル。**同じシード番号からは必ず同じ配ぷよが出る**ようにするのがポイント。
`Math.random()` は毎回違う値を返すので使えない。代わりに「種（シード）から決まった順番で数を出す」自前の乱数を使う。

作り方は、ぷよぷよeスポーツの**チャレンジモード**（1000万TA など）の配ぷよの性質に合わせた**本作独自の方式**。チャレンジモードの本当の作り方は公開されていないので、公開されている性質だけをまねている。そのため、同じシード番号でも本家の配ぷよとは一致しない。

方式のあらまし:
1. シード（0〜65535）から乱数を作る
2. 5色の並び順（カラーマップ）を決める
3. 128手を8手（16個）ずつの区切りに分け、区切りごとに「各色の数がそろった16個」を作ってシャッフルする（4色なら4個ずつ）
4. 最初の区切りだけは、最初の2手（4個）にちょうど3色が入るまでシャッフルし直す

8手ごとに色の数がそろうので、**ある色ばかり続いたり、しばらく来なかったりする偏りが起きにくい**。
以前の方式（対戦モードと同じ作り方）は128手全体では色の数がそろうが、途中では偏ることがあった。

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

**L10–16**

```ts
10 | /** 1ループの手数 */
11 | const LOOP = 128;
12 | /** 色の数をそろえる単位（8手＝16個） */
13 | const BLOCK_PAIRS = 8;
14 | /** 本家の色の総数 */
15 | const ALL_COLORS = 5;
16 | 
```

- `LOOP = 128` … 128手で一周する。
- `BLOCK_PAIRS = 8` … 色の数をそろえる単位。8手＝16個。
- `ALL_COLORS = 5` … 本家の色は全部で5色。4色で遊ぶときも、5色のうちどの4色を使うかはシードで決まる。

## 乱数 createRng

**L17–28**

```ts
17 | /**
18 |  * 線形合同法の乱数（ぷよぷよeスポーツと同じ定数）。
19 |  * 状態を進めてから、上位16bitを 0〜m-1 に縮めて返す（剰余ではなく掛けて16bitずらす）。
20 |  */
21 | export function createRng(seed: number): (m: number) => number {
22 |   let s = seed >>> 0;
23 |   return (m) => {
24 |     s = (Math.imul(s, 0x5d588b65) + 0x269ec3) >>> 0;
25 |     return ((s >>> 16) * m) >>> 16;
26 |   };
27 | }
28 | 
```

**線形合同法**（LCG）という昔からある乱数の作り方。定数はぷよぷよeスポーツと同じものを使っている。
- L22: 状態 `s` をシードで初期化する。`>>> 0` は「32bit の符号なし整数にする」おまじない。
- L24: 次の状態を「今の状態 × 0x5D588B65 ＋ 0x269EC3」で作る。`0x` は16進数。`Math.imul` は32bit 同士の掛け算（普通の `*` だと桁があふれて誤差が出るので使う）。`>>> 0` で32bit に収める。
- L25: 状態の上位16bit（`s >>> 16`、0〜65535）に `m` を掛けて、また16bit 右にずらす。これで 0〜m-1 の数になる。
- 戻り値は「呼ぶたびに次の数を返す関数」。`rand(5)` なら 0〜4 のどれかが返る。

## 配ぷよを作る generateTsumo

**L29–39**

```ts
29 | /**
30 |  * シードから1ループ分（128手）の配ぷよを生成する。ぷよぷよeスポーツのチャレンジモードの性質に合わせた本作独自の方式。
31 |  * - 8手（16個）ごとに区切り、区切りの中で各色の数をそろえる（4色なら4個ずつ）
32 |  *   3色・5色は16個を割り切れないので、1色だけ1個多くし、その色を8手ごとに順番に替える（9〜128手目の合計は全色同じ）
33 |  * - 最初の2手（4個）には必ずちょうど3色が入る
34 |  * - 区切りの中の並びは乱数でシャッフルする
35 |  */
36 | export function generateTsumo(seed: number, colorCount: number = CONFIG.COLOR_COUNT): Pair[] {
37 |   const rand = createRng(seed & 0xffff);
38 |   const n = Math.min(Math.max(colorCount, 3), ALL_COLORS);
39 | 
```

- 引数 `seed` … シード番号。`& 0xffff` で下16bit（0〜65535）だけを使う。本作のシード番号は 1〜65536 なので、65536 は 0 と同じ配ぷよになる。
- 引数 `colorCount` … 色数（3〜5）。省略すると `CONFIG.COLOR_COUNT`（4）。
- L38: 色数を 3〜5 に収める。

**L40–46**

```ts
40 |   // 5色のうちどれをどの番号に使うか（カラーマップ）
41 |   const remaining = Array.from({ length: ALL_COLORS }, (_, i) => i);
42 |   const colorMap: Color[] = [];
43 |   for (let k = ALL_COLORS; k >= 1; k--) {
44 |     colorMap.push(remaining.splice(rand(k), 1)[0]);
45 |   }
46 | 
```

カラーマップを作る。
- L41: `remaining` は残っている色 `[0, 1, 2, 3, 4]`。`Array.from({ length: 5 }, (_, i) => i)` は「長さ5で、i 番目が i の配列」。
- L43–45: 5回、残りの中から乱数で1色選んで `colorMap` に入れ、`remaining` から取り除く（`splice(位置, 1)` は1個取り除いて、取り除いた要素の配列を返す）。
- 以下では色を 0〜n-1 の番号で扱い、最後に `colorMap` で本当の色に読み替える。4色なら `colorMap` の先頭4色が使われる。

**L47–64**

```ts
47 |   const size = BLOCK_PAIRS * 2;
48 |   const base = Math.floor(size / n);
49 |   const hasExtra = size % n !== 0;
50 |   const puyos: Color[] = [];
51 |   for (let block = 0; block < LOOP / BLOCK_PAIRS; block++) {
52 |     // 1個多くする色。最初の区切りは乱数、以降は順番に替える
53 |     const extra = block === 0 ? rand(n) : (block - 1) % n;
54 |     const pool: number[] = [];
55 |     for (let c = 0; c < n; c++) {
56 |       const count = base + (hasExtra && c === extra ? 1 : 0);
57 |       for (let k = 0; k < count; k++) pool.push(c);
58 |     }
59 |     do {
60 |       shuffle(pool, rand);
61 |     } while (block === 0 && new Set(pool.slice(0, 4)).size !== 3);
62 |     for (const c of pool) puyos.push(colorMap[c]);
63 |   }
64 | 
```

8手（16個）ずつの区切りを16個作る（16 × 8手 = 128手）。
- L47–49: 1区切りの個数は16。`base` は1色あたりの数（4色なら4、3色なら5、5色なら3）。`hasExtra` は割り切れずに余りが出るか（3色・5色は16を割り切れないので1個余る）。
- L53: 余りの1個をどの色にするか。最初の区切りは乱数、2つ目からは 0, 1, 2, … と順番に替える。こうすると9〜128手目（15区切り）で、どの色も同じ回数だけ「1個多い」役が回ってくる（3色なら5回ずつ、5色なら3回ずつ）ので、合計がそろう。
- L54–58: その区切りの16個を、色ごとに決めた数だけ並べる。
- L59–61: シャッフルする。最初の区切りだけは、先頭4個（最初の2手）にちょうど3色入るまでやり直す（`do { … } while (条件)` は「まず1回やって、条件が成り立つ間くり返す」）。`new Set(配列).size` は配列に何種類の値があるか。
- L62: カラーマップで本当の色に読み替えて、全体の列 `puyos` に足す。

**L65–71**

```ts
65 |   const pairs: Pair[] = [];
66 |   for (let i = 0; i < puyos.length; i += 2) {
67 |     pairs.push({ axis: puyos[i], child: puyos[i + 1] });
68 |   }
69 |   return pairs;
70 | }
71 | 
```

256個を前から2個ずつ取り、1個目を軸ぷよ、2個目を子ぷよにして128手の配列を返す。

**L72–79**

```ts
72 | /** 配列をその場でシャッフルする（フィッシャー–イェーツ） */
73 | function shuffle(a: number[], rand: (m: number) => number): void {
74 |   for (let i = a.length - 1; i > 0; i--) {
75 |     const j = rand(i + 1);
76 |     [a[i], a[j]] = [a[j], a[i]];
77 |   }
78 | }
79 | 
```

`shuffle` … 配列をその場でシャッフルする。**フィッシャー–イェーツ**という定番の方法で、どの並びも同じ確率になる。
後ろから順に、「自分より前（自分を含む）の中から乱数で1つ選んで入れ替える」をくり返す。

**L80–84**

```ts
80 | /** シードをランダムに選ぶ（1〜SEED_COUNT） */
81 | export function randomSeed(): number {
82 |   return 1 + Math.floor(Math.random() * CONFIG.SEED_COUNT);
83 | }
84 | 
```

ランダムなシード番号（1〜65536）を選ぶ。こちらは「毎回違ってほしい」ので `Math.random()` を使う。
`Math.floor(Math.random() * 65536)` が 0〜65535 なので、1を足して 1〜65536 にしている。

## ループするツモ列 TsumoSequence

**L85–94**

```ts
85 | /** ループするツモ列 */
86 | export class TsumoSequence {
87 |   private readonly pairs: Pair[];
88 |   constructor(public readonly seed: number) {
89 |     this.pairs = generateTsumo(seed);
90 |   }
91 |   at(index: number): Pair {
92 |     return this.pairs[index % this.pairs.length];
93 |   }
94 | }
```

生成した128手を持っておき、何手目でも取り出せるようにする**クラス**。
- L87: `private readonly pairs` … クラスの外から見えない（`private`）、作った後は変えない（`readonly`）プロパティ。
- L88: `constructor(public readonly seed: number)` … 引数に `public readonly` を付けると、「引数を受け取る」と「同名のプロパティに保存する」を一度に書ける TypeScript の省略記法。`new TsumoSequence(123).seed` で 123 が読める。
- L89: 作った瞬間に128手を生成しておく。
- L91–93: `at(index)` で index 手目のペアを返す。`%`（割った余り）を使うので、128手目は0手目に戻る＝**128手ループ**になる。
