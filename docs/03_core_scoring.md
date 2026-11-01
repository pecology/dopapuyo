# src/core/scoring.ts

得点計算のファイル。ぷよぷよeスポーツ（通ルール）の計算式と、3種類のボーナス表を持つ。
盤面のことは何も知らず、「何連鎖目で、何個のグループを、何色消したか」だけから点数を出す。

**L1–2**

```ts
 1 | /** ぷよぷよeスポーツ（通ルール）準拠の得点ボーナス */
 2 | 
```

ファイルの説明コメント。

## ボーナス表

**L3–6**

```ts
 3 | const CHAIN_BONUS = [0, 8, 16, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448, 480, 512];
 4 | const LINK_BONUS: Record<number, number> = { 4: 0, 5: 2, 6: 3, 7: 4, 8: 5, 9: 6, 10: 7 };
 5 | const COLOR_BONUS = [0, 0, 3, 6, 12, 24];
 6 | 
```

- `CHAIN_BONUS` … 連鎖ボーナス。配列の0番目が1連鎖目、1番目が2連鎖目…。1連鎖は0、2連鎖は8、3連鎖は16、4連鎖からは倍々（32, 64）、6連鎖以降は32ずつ増えて19連鎖で512。
- `LINK_BONUS` … 連結ボーナス。`Record<number, number>` は「キーも値も数値のオブジェクト」という型。4個つながりなら0、5個なら2…10個なら7。11個以上は関数側で10にする。
- `COLOR_BONUS` … 色数ボーナス。インデックスがそのまま色数になるよう、0番目にダミーの0を入れている。1色0、2色3、3色6、4色12、5色24。

**L7–11**

```ts
 7 | export function chainBonus(chain: number): number {
 8 |   if (chain <= CHAIN_BONUS.length) return CHAIN_BONUS[chain - 1];
 9 |   // 理論上ほぼ起きないが、20連鎖以上は+32ずつ伸ばす
10 |   return CHAIN_BONUS[CHAIN_BONUS.length - 1] + 32 * (chain - CHAIN_BONUS.length);
11 | }
```

`chainBonus(chain)` … 連鎖数から連鎖ボーナスを返す。
- L8: 19連鎖までは表をそのまま引く。連鎖数は1から数えるので、配列の添字は `chain - 1`。
- L10: 20連鎖以上は表にないので、最後の値（512）から32ずつ足す。6列×13段に色が限られるので、実際に起きることはまずない。

**L12–15**

```ts
12 | 
13 | export function linkBonus(size: number): number {
14 |   return size >= 11 ? 10 : LINK_BONUS[size] ?? 0;
15 | }
```

`linkBonus(size)` … 1グループのつながり数から連結ボーナスを返す。
`size >= 11 ? 10 : ...` で11個以上は一律10。それ以外は表を引き、`?? 0` で表にない値（3以下など）なら0にする。`??` は「左が undefined/null なら右を使う」演算子。

**L16–19**

```ts
16 | 
17 | export function colorBonus(colors: number): number {
18 |   return COLOR_BONUS[colors] ?? 0;
19 | }
```

`colorBonus(colors)` … 同時に消えた色の数から色数ボーナスを返す。表にない値なら0。

## 1連鎖ぶんの得点 stepScore

**L20–29**

```ts
20 | 
21 | /**
22 |  * 1連鎖ぶんの得点
23 |  * 消したぷよ数 × 10 × (連鎖ボーナス + 連結ボーナス + 色数ボーナス)。合計0なら1として計算
24 |  */
25 | export function stepScore(chain: number, groupSizes: number[], colorCount: number): number {
26 |   const cleared = groupSizes.reduce((a, b) => a + b, 0);
27 |   const bonus = chainBonus(chain) + groupSizes.reduce((a, s) => a + linkBonus(s), 0) + colorBonus(colorCount);
28 |   return cleared * 10 * Math.max(1, bonus);
29 | }
```

- 引数: `chain` は何連鎖目か、`groupSizes` は同時に消えた各グループの個数（例: 4個と5個が同時なら `[4, 5]`）、`colorCount` は消えた色の数。
- L26: `reduce((a, b) => a + b, 0)` で配列の合計を出す。消えたぷよの総数。
- L27: ボーナスの合計。連結ボーナスはグループごとに計算して足し合わせる（`reduce` の中で `linkBonus(s)` を足している）。
- L28: `消した数 × 10 × ボーナス合計`。ボーナスが0（1連鎖・4個・1色）のときは `Math.max(1, bonus)` で1として扱うので、最低でも 4×10×1=40点になる。

例: 3連鎖目で4個と6個（2色）が同時に消えたら、`10 × 10 × (16 + 0 + 3 + 3) = 2200` 点。
